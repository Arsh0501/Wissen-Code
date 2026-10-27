export class ExecutionLimiter {
  private active = 0;
  private waiting: {
    accept: () => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }[] = [];
  constructor(
    private readonly concurrency = 4,
    private readonly maxWaiting = 100,
    private readonly waitMs = 15000,
  ) {
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 64)
      throw new Error('Execution concurrency must be between 1 and 64');
  }
  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active < this.concurrency) this.active++;
    else {
      if (this.waiting.length >= this.maxWaiting)
        throw Object.assign(new Error('Execution service is busy. Retry shortly.'), {
          status: 503,
        });
      await new Promise<void>((accept, reject) => {
        const waiter = {
          accept,
          reject,
          timer: setTimeout(() => {
            this.waiting = this.waiting.filter((item) => item !== waiter);
            reject(
              Object.assign(new Error('Execution queue timed out. Retry shortly.'), {
                status: 503,
              }),
            );
          }, this.waitMs),
        };
        this.waiting.push(waiter);
      });
    }
    try {
      return await operation();
    } finally {
      const next = this.waiting.shift();
      if (next) {
        clearTimeout(next.timer);
        next.accept();
      } else this.active--;
    }
  }
}
