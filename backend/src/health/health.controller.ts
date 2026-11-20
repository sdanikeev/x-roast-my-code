import { Controller, Get, Inject } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get()
  async check() {
    await this.dataSource.query('SELECT 1');
    const redis = await this.redis.ping();
    return { status: 'ok', postgres: 'ok', redis: redis === 'PONG' ? 'ok' : redis };
  }
}
