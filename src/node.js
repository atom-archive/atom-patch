import {ZERO_POINT} from './point-helpers'

let idCounter = 0

export default class Node {
  constructor(oldDistanceFromEndOfLeftAncestor, newDistanceFromEndOfLeftAncestor) {
    this.id = ++idCounter
    this.oldDistanceFromEndOfLeftAncestor = oldDistanceFromEndOfLeftAncestor
    this.newDistanceFromEndOfLeftAncestor = newDistanceFromEndOfLeftAncestor
    this.oldExtent = ZERO_POINT
    this.newExtent = ZERO_POINT
    this.leftChild = null
    this.rightChild = null
    this.newText = ''
    this.oldText = ''
  }
}
