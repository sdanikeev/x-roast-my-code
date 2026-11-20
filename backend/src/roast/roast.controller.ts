import { Body, Controller, HttpCode, Logger, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, JwtAuthGuard, type AuthUser } from '../auth/jwt-auth.guard.js';
import { RoastDto } from './roast.dto.js';
import { RoastService } from './roast.service.js';

@Controller('roast')
@UseGuards(JwtAuthGuard)
export class RoastController {
  private readonly log = new Logger(RoastController.name);

  constructor(private readonly roast: RoastService) {}

  @Post()
  @HttpCode(200)
  run(@CurrentUser() user: AuthUser, @Body() dto: RoastDto) {
    return this.roast.roast(user.id, dto.code, dto.filename, dto.toxicity, dto.language);
  }

  /**
   * Same roast as an SSE stream: `stage` (analyzing | roasting), `facts` (flagged lines, before any joke exists),
   * then `result` or `error`. The stream opens lazily on the first event, so a rejection that happens before any
   * work starts (429 rate limit / busy, 400, 401) is still a plain HTTP error with a real status code.
   */
  @Post('stream')
  async stream(@CurrentUser() user: AuthUser, @Body() dto: RoastDto, @Res() res: Response): Promise<void> {
    let open = false;
    const send = (event: string, data: unknown) => {
      if (res.writableEnded || res.destroyed) return;
      if (!open) {
        open = true;
        res.status(200).set({
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform', // no-transform: keep proxies from compressing (= buffering) it
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        res.flushHeaders();
      }
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const result = await this.roast.roast(user.id, dto.code, dto.filename, dto.toxicity, dto.language, (e) => {
        const { type, ...data } = e;
        send(type, data);
      });
      send('result', result);
    } catch (e) {
      if (!open) throw e; // nothing sent yet: Nest turns it into the normal HTTP error
      const status = (e as { status?: number }).status ?? 500;
      this.log.warn(`roast stream failed after start: ${(e as Error).message}`);
      send('error', { status });
    }
    if (!res.writableEnded) res.end();
  }
}
