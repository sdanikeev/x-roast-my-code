import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { GithubService } from './github.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { TokensService } from './tokens.service.js';

@Module({
  imports: [JwtModule.register({}), UsersModule],
  controllers: [AuthController],
  providers: [AuthService, TokensService, GithubService, JwtAuthGuard],
  exports: [TokensService, JwtAuthGuard],
})
export class AuthModule {}
