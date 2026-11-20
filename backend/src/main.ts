import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  configureApp(app, process.env.FRONTEND_URL ?? 'http://localhost:3000');
  await app.listen(process.env.PORT ?? 4000);
}
await bootstrap();
