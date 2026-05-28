// src/services/downloader/queue.js
// Download Queue — concurrency limiter + timeout + retry

import { logger } from '../../utils/logger.js'

export class DownloadQueue {
    #queue = []
    #running = 0
    #concurrency
    #timeout
    #stats = { completed: 0, failed: 0, queued: 0 }

    constructor({ concurrency = 3, timeout = 90_000 } = {}) {
        this.#concurrency = concurrency
        this.#timeout = timeout
    }

    /**
     * Add a task to the queue.
     * @param {Function} fn   - async function to execute
     * @param {Object}   opts - { label, retries }
     * @returns {Promise}
     */
    add(fn, { label = 'task', retries = 2 } = {}) {
        return new Promise((resolve, reject) => {
            this.#stats.queued++
            this.#queue.push({ fn, label, retries, resolve, reject })
            this.#tick()
        })
    }

    #tick() {
        while (this.#running < this.#concurrency && this.#queue.length > 0) {
            const task = this.#queue.shift()
            this.#running++
            this.#run(task)
        }
    }

    async #run(task, attempt = 1) {
        const { fn, label, retries, resolve, reject } = task

        try {
            const result = await this.#withTimeout(fn(), this.#timeout, label)
            this.#stats.completed++
            resolve(result)
        } catch (err) {
            if (attempt <= retries) {
                logger.warn(`[Queue] "${label}" failed attempt ${attempt}/${retries}: ${err.message}. Retrying...`)
                const delay = attempt * 2000 // 2s, 4s
                await new Promise(r => setTimeout(r, delay))
                return this.#run(task, attempt + 1)
            }

            this.#stats.failed++
            logger.error(`[Queue] "${label}" failed after ${retries} retries: ${err.message}`)
            reject(err)
        } finally {
            this.#running--
            this.#tick()
        }
    }

    #withTimeout(promise, ms, label) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Timeout: "${label}" melebihi ${ms / 1000}s`))
            }, ms)

            promise
                .then(val => { clearTimeout(timer); resolve(val) })
                .catch(err => { clearTimeout(timer); reject(err) })
        })
    }

    get stats() {
        return {
            ...this.#stats,
            running: this.#running,
            pending: this.#queue.length,
        }
    }

    get size() {
        return this.#queue.length
    }

    get activeCount() {
        return this.#running
    }
}