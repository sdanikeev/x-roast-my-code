import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RoastController } from './roast.controller.js';
import { LlmClient } from './llm.client.js';
import { RoastService } from './roast.service.js';

@Module({
  imports: [AuthModule],
  controllers: [RoastController],
  providers: [RoastService, LlmClient],
})
export class RoastModule {}
