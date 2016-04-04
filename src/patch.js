import {ZERO_POINT, traverse, traversalDistance, min, isZero, compare} from './point-helpers'
import {getExtent, characterIndexForPoint} from './text-helpers'
import Iterator from './iterator'
import {serializeChanges, deserializeChanges} from './serialization'

export default class Patch {
  static compose (patches) {
    let composedPatch = new Patch()
    for (let index = 0; index < patches.length; index++) {
      let changes = patches[index].getChanges()
      if ((index & 1) === 0) { // flip
        for (let i = 0; i < changes.length; i++) {
          let {newStart, oldExtent, newExtent, oldText, newText} = changes[i]
          composedPatch.splice(newStart, oldExtent, newExtent, {oldText, newText})
        }
      } else { // flop
        for (let i = changes.length - 1; i >= 0; i--) {
          let {oldStart, oldExtent, newExtent, oldText, newText} = changes[i]
          composedPatch.splice(oldStart, oldExtent, newExtent, {oldText, newText})
        }
      }
    }

    return new Patch({cachedChanges: composedPatch.getChanges()})
  }

  static invert (patch) {
    let invertedChanges = patch.getChanges().map((change) => {
      return {
        oldStart: change.newStart, newStart: change.oldStart,
        oldExtent: change.newExtent, newExtent: change.oldExtent,
        oldText: change.newText, newText: change.oldText
      }
    })

    return new Patch({cachedChanges: invertedChanges})
  }

  static hunk (change) {
    let changes = [{
      oldStart: change.newStart,
      newStart: change.newStart,
      oldExtent: change.oldExtent,
      newExtent: change.newExtent,
      oldText: change.oldText,
      newText: change.newText
    }]

    return new Patch({cachedChanges: changes})
  }

  static deserialize (serializedChanges) {
    return new Patch({serializedChanges})
  }

  constructor (params = {}) {
    this.root = null
    this.nodesCount = 0
    this.cachedChanges = params.cachedChanges
    this.serializedChanges = params.serializedChanges
    if (params.cachedChanges || params.serializedChanges) {
      this.freeze()
    }
  }

  serialize () {
    if (this.serializedChanges == null) {
      this.serializedChanges = serializeChanges(this.getChanges())
      this.freeze()
    }

    return this.serializedChanges
  }

  freeze () {
    this.splice = function () { throw new Error("Cannot splice into a read-only Patch!") }
  }

  spliceWithText (start, oldText, newText) {
    this.splice(start, getExtent(oldText), getExtent(newText), {oldText, newText})
  }

  splice (start, oldExtent, newExtent, oldText, newText) {
    if (isZero(oldExtent) && isZero(newExtent)) return

    // Determine where this splice ends now and where it *will* end once the
    // old extend is replaced with the new extent.
    let oldEnd = traverse(start, oldExtent)
    let newEnd = traverse(start, newExtent)

    // Find an existing change that containins the start of the current splice.
    // If none exists, an empty placeholder change will be inserted instead.
    let changeContainingStart = this.splayContainingChange(start)

    // Find an existing change that containins the end of the current splice.
    // If none exists, an empty placeholder change will be inserted instead.
    let changeContainingEnd = this.splayContainingChange(oldEnd)

    if (changeContainingStart === changeContainingEnd) {
      // If the same change contains the start and end of the splice, we just
      // need to splice the new text into the existing change and adjust its
      // new extent accordingly. Old text should be ignored because this splice
      // is entirely within an existing change.

      let startOfChangeContainingStart = changeContainingStart.newDistanceFromEndOfLeftAncestor
      let endOfChangeContainingStart = traverse(startOfChangeContainingStart, changeContainingStart.newExtent)

      // The new text is the text preceding the start of the splice, plus the
      // new text associated with the splice, plus the text following the splice.
      changeContainingStart.newText =
        getPrefix(changeContainingStart.newText, traversalDistance(start, startOfChangeContainingStart)) +
          newText +
            getSuffix(changeContainingStart.newText, traversalDistance(oldEnd, startOfChangeContainingStart))

      // The new extent is the distance from the start of the change containing
      // the splice to the new end of the change, plus whatever portion of the
      // change containing the splice followed the splice.
      changeContainingStart.newExtent =
        traverse(
          traversalDistance(newEnd, startOfChangeContainingStart),
          traversalDistance(endOfChangeContainingStart, oldEnd)
        )
    } else {
      // The change containing the end of the current splice is at the root
      // of the tree, with the change containing the start of the splice as
      // its left child. We will replace these changes with a single change.

      let startOfChangeContainingStart = changeContainingStart.newDistanceFromEndOfLeftAncestor
      let endOfChangeContainingStart = traverse(startOfChangeContainingStart, changeContainingStart.newExtent)
      let startOfChangeContainingEnd = changeContainingEnd.newDistanceFromEndOfLeftAncestor
      let endOfChangeContainingEnd = traverse(startOfChangeContainingEnd, changeContainingEnd.newExtent)

      // If the change containing the start of the current splice starts before
      // the current splice, we need to incorporate the portion of its new text
      // that we're not overwriting into the new text of the new change we're
      // creating.
      changeContainingEnd.newText =
        getPrefix(changeContainingStart.newText, traversalDistance(start, startOfChangeContainingStart)) +
          newText +
            getSuffix(changeContainingEnd.newText, traversalDistance(oldEnd, startOfChangeContainingEnd))

      // The oldText supplied with this splice may actually contain some new
      // text from a previous splice. We want the old text of the change we're
      // inserting to reflect the *original* text, so we'll synthesize it from
      // the this splice's old text and any existing changes.
      changeContainingEnd.oldText =
        changeContainingStart +
          this.synthesizeOldText(
            this.changesForSubtree(changeContainingStart.rightChild),
            getPrefix(
              getSuffix(oldText, traversalDistance(endOfChangeContainingStart, start)),
              traversalDistance(startOfChangeContainingEnd, endOfChangeContainingStart)
            )
          ) +
            changeContainingEnd.oldText

      // Now we replace the changes containing the start and end with a single
      // change by mutating the change containing the end and deleting the
      // change containing the start, effectively merging them.

      // The old extent of the merged nodes is the distance from the old start
      // of the change containing the splice start to the old end of the change
      // containing the splice end.
      changeContainingEnd.oldExtent = traversalDistance(
        traverse(
          changeContainingEnd.oldDistanceFromEndOfLeftAncestor,
          changeContainingEnd.oldExtent
        ),
        changeContainingStart.oldDistanceFromEndOfLeftAncestor
      )

      // The new extent is the distance from the new start of the change
      // containing the start to the new end of the splice, plus however much
      // of the change containing the end of the splice we didn't overlap.
      changeContainingEnd.newExtent = traverse(
        traversalDistance(newEnd, startOfChangeContainingStart),
        traversalDistance(endOfChangeContainingEnd, oldEnd)
      )

      // Now we update the start of the change containing the end of the splice
      // to match the start of the change containing the start of the splice.
      changeContainingEnd.oldDistanceFromEndOfLeftAncestor = changeContainingStart.oldDistanceFromEndOfLeftAncestor
      changeContainingEnd.newDistanceFromEndOfLeftAncestor = changeContainingStart.newDistanceFromEndOfLeftAncestor

      // Then we delete the node representing the change containing the start
      // of the splice along with all changes in between it and the change
      // containing the end of the splice. This completes the merging of the
      // changes containing the start and end of the splice into a single
      // change.
      changeContainingEnd.leftChild = changeContainingStart.leftChild
    }

    // Bust the cache.
    this.cachedChanges = null
  }

  // Finds or creates a node at the root of the tree representing a change
  // containing the given target point. If no existing change is found, an
  // empty change is created.
  //
  // This method follows a top-down strategy, dividing the existing tree into
  // left and right subtrees that will eventually be appended as left and right
  // children of the returned node.
  splayContainingChange (target) {
    if (!this.root) {
      this.root = new Node(target, target)
      return this.root
    }

    let newLeftSubtree = new Node(null, null)
    let newRightSubtree = new Node(null, null)
    let newLeftSubtreeMax = newLeftSubtree
    let newRightSubtreeMin = newRightSubtree

    let leftAncestorEnd = ZERO_POINT
    let currentNode = this.root

    while (true) {
      let currentNodeStart = traverse(leftAncestorEnd, currentNode.newDistanceFromEndOfLeftAncestor)

      if (compare(target, currentNodeStart) < 0) {
        // Descend left
      } else {
        let currentNodeEnd = traverse(currentNodeStart, currentNode.newExtent)
        if (compare(target, currentNodeEnd) > 0) {
          // Descend right
        }

        // We found a node containing the target position
        break
      }
    }

    newLeftSubtreeMax.rightChild = currentNode.leftChild
    newRightSubtreeMin.leftChild = currentNode.rightChild
    currentNode.leftChild = newLeftSubtree.rightChild
    currentNode.rightChild = newRightSubtree.leftChild

    this.root = currentNode
    return currentNode
  }

  replaceChangedText (oldText, startNode, endNode) {
    let replacedText = ""
    let lastChangeEnd = ZERO_POINT
    for (let change of this.changesForSubtree(startNode.right)) {
      if (change.start) {
        replacedText += oldText.substring(
          characterIndexForPoint(oldText, lastChangeEnd),
          characterIndexForPoint(oldText, change.start)
        )
      } else if (change.end) {
        replacedText += change.oldText
        lastChangeEnd = change.end
      }
    }

    if (endNode.oldText == null) {
      replacedText += oldText.substring(characterIndexForPoint(oldText, lastChangeEnd))
    } else {
      replacedText += endNode.oldText
    }

    return replacedText
  }

  changesForSubtree (node, outputDistance = ZERO_POINT, changes = []) {
    if (node == null) return changes

    this.changesForSubtree(node.left, outputDistance, changes)
    let change = {}
    let outputLeftExtent = traverse(outputDistance, node.outputLeftExtent)
    if (node.isChangeStart) change.start = outputLeftExtent
    if (node.isChangeEnd) {
      change.end = outputLeftExtent
      change.oldText = node.oldText
    }
    changes.push(change)
    this.changesForSubtree(node.right, outputLeftExtent, changes)

    return changes
  }

  getChanges () {
    if (this.cachedChanges == null) {
      if (this.serializedChanges == null) {
        this.cachedChanges = this.iterator.getChanges()
      } else {
        this.cachedChanges = deserializeChanges(this.serializedChanges)
      }
    }

    return this.cachedChanges
  }

  deleteNode (node) {
    this.bubbleNodeDown(node)
    if (node.parent) {
      if (node.parent.left === node) {
        node.parent.left = null
      } else {
        node.parent.right = null
        node.parent.inputExtent = node.parent.inputLeftExtent
        node.parent.outputExtent = node.parent.outputLeftExtent
        let ancestor = node.parent
        while (ancestor.parent && ancestor.parent.right === ancestor) {
          ancestor.parent.inputExtent = traverse(ancestor.parent.inputLeftExtent, ancestor.inputExtent)
          ancestor.parent.outputExtent = traverse(ancestor.parent.outputLeftExtent, ancestor.outputExtent)
          ancestor = ancestor.parent
        }
      }

      this.splayNode(node.parent)
    } else {
      this.root = null
    }

    this.nodesCount--
  }

  bubbleNodeDown (node) {
    let rightAncestor

    while (true) {
      if (node.left) {
        this.rotateNodeRight(node.left)
      } else if (node.right) {
        rightAncestor = node.right
        this.rotateNodeLeft(node.right)
      } else {
        break
      }
    }

    return rightAncestor
  }

  splayNode (node) {
    if (node == null) return

    while (true) {
      if (this.isNodeLeftChild(node.parent) && this.isNodeRightChild(node)) { // zig-zag
        this.rotateNodeLeft(node)
        this.rotateNodeRight(node)
      } else if (this.isNodeRightChild(node.parent) && this.isNodeLeftChild(node)) { // zig-zag
        this.rotateNodeRight(node)
        this.rotateNodeLeft(node)
      } else if (this.isNodeLeftChild(node.parent) && this.isNodeLeftChild(node)) { // zig-zig
        this.rotateNodeRight(node.parent)
        this.rotateNodeRight(node)
      } else if (this.isNodeRightChild(node.parent) && this.isNodeRightChild(node)) { // zig-zig
        this.rotateNodeLeft(node.parent)
        this.rotateNodeLeft(node)
      } else { // zig
        if (this.isNodeLeftChild(node)) {
          this.rotateNodeRight(node)
        } else if (this.isNodeRightChild(node)) {
          this.rotateNodeLeft(node)
        }

        return
      }
    }
  }

  isNodeLeftChild (node) {
    return node != null && node.parent != null && node.parent.left === node
  }

  isNodeRightChild (node) {
    return node != null && node.parent != null && node.parent.right === node
  }

  rotateNodeLeft (pivot) {
    let root = pivot.parent

    if (root.parent) {
      if (root === root.parent.left) {
        root.parent.left = pivot
      } else {
        root.parent.right = pivot
      }
    } else {
      this.root = pivot
    }
    pivot.parent = root.parent

    root.right = pivot.left
    if (root.right) {
      root.right.parent = root
    }

    pivot.left = root
    pivot.left.parent = pivot

    pivot.inputLeftExtent = traverse(root.inputLeftExtent, pivot.inputLeftExtent)
    pivot.inputExtent = traverse(pivot.inputLeftExtent, (pivot.right ? pivot.right.inputExtent : ZERO_POINT))
    root.inputExtent = traverse(root.inputLeftExtent, (root.right ? root.right.inputExtent : ZERO_POINT))

    pivot.outputLeftExtent = traverse(root.outputLeftExtent, pivot.outputLeftExtent)
    pivot.outputExtent = traverse(pivot.outputLeftExtent, (pivot.right ? pivot.right.outputExtent : ZERO_POINT))
    root.outputExtent = traverse(root.outputLeftExtent, (root.right ? root.right.outputExtent : ZERO_POINT))
  }

  rotateNodeRight (pivot) {
    let root = pivot.parent

    if (root.parent) {
      if (root === root.parent.left) {
        root.parent.left = pivot
      } else {
        root.parent.right = pivot
      }
    } else {
      this.root = pivot
    }
    pivot.parent = root.parent

    root.left = pivot.right
    if (root.left) {
      root.left.parent = root
    }

    pivot.right = root
    pivot.right.parent = pivot

    root.inputLeftExtent = traversalDistance(root.inputLeftExtent, pivot.inputLeftExtent)
    root.inputExtent = traversalDistance(root.inputExtent, pivot.inputLeftExtent)
    pivot.inputExtent = traverse(pivot.inputLeftExtent, root.inputExtent)

    root.outputLeftExtent = traversalDistance(root.outputLeftExtent, pivot.outputLeftExtent)
    root.outputExtent = traversalDistance(root.outputExtent, pivot.outputLeftExtent)
    pivot.outputExtent = traverse(pivot.outputLeftExtent, root.outputExtent)
  }
}
