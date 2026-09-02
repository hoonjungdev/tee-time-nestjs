import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { UnhandledExceptionFilter } from './unhandled-exception.filter.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.useGlobalFilters(new UnhandledExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      // 모르는 필드는 거부한다. 조용히 무시하면 오타가 성공 응답으로 돌아온다.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // 프론트가 브라우저에서 직접 호출한다. 허용 오리진은 설정으로 받는다 —
  // 와일드카드는 자격증명 요청에서 브라우저가 거부하고,
  // 무엇보다 어디서 부르는지를 코드가 말하지 않게 된다.
  const allowedOrigins = (process.env['CORS_ALLOWED_ORIGINS'] ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  app.enableCors({
    origin: allowedOrigins,
    exposedHeaders: ['WWW-Authenticate'],
  });

  // 프론트가 읽을 계약. BFF가 없으므로 이 문서가 유일한 통로다.
  const openApi = new DocumentBuilder()
    .setTitle('TeeTime API')
    .setDescription('골프 티타임 예약 플랫폼')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  SwaggerModule.setup('openapi', app, () => SwaggerModule.createDocument(app, openApi), {
    jsonDocumentUrl: 'openapi/v1.json',
  });

  const port = Number(process.env['PORT'] ?? 5086);
  await app.listen(port);
}

void bootstrap();
