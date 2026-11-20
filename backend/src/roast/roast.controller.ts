import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, JwtAuthGuard, type AuthUser } from '../auth/jwt-auth.guard.js';
import { RoastDto } from './roast.dto.js';
import { RoastService } from './roast.service.js';

@Controller('roast')
@UseGuards(JwtAuthGuard)
export class RoastController {
  constructor(private readonly roast: RoastService) {}

  @Post()
  @HttpCode(200)
  run(@CurrentUser() user: AuthUser, @Body() dto: RoastDto) {
    return this.roast.roast(user.id, dto.code, dto.filename, dto.toxicity, dto.language);
  }
}
