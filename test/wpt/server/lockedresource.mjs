export class LockedResource {
  constructor (resource) {
    this.locked = false
    this.waitingQueue = []
    this.resource = resource
  }

  async acquire () {
    return new Promise(resolve => {
      if (!this.locked) {
        // If the lock is not already acquired, acquire it immediately
        this.locked = true
        resolve(this.resource)
      } else {
        // If the lock is already acquired, queue the resolve function
        this.waitingQueue.push(resolve)
      }
    })
  }

  release () {
    if (this.waitingQueue.length > 0) {
      // If there are functions waiting to acquire the lock, execute the next one in the queue
      const nextResolve = this.waitingQueue.shift()
      nextResolve(this.resource)
    } else {
      // If there are no functions waiting, release the lock
      this.locked = false
    }
  }
}
