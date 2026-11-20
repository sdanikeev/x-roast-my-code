import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { HealthController } from './health/health.controller.js';
import { RedisModule } from './redis/redis.module.js';
import { AuthModule } from './auth/auth.module.js';
import { RoastModule } from './roast/roast.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USER', 'app'),
        password: config.get<string>('DB_PASSWORD', 'app'),
        database: config.get<string>('DB_NAME', 'app'),
        autoLoadEntities: true,
        // Schema auto-sync: convenient for dev/CI. Real production should run migrations and set DB_SYNCHRONIZE=false.
        synchronize: String(config.get('DB_SYNCHRONIZE', config.get('NODE_ENV') !== 'production')) === 'true',
      }),
    }),
    RedisModule,
    UsersModule,
    AuthModule,
    RoastModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
