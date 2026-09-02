import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * **처리되지 않은 예외만** 담당한다.
 *
 * 도메인 실패는 여기 오지 않는다 — `Result`로 표현되어 컨트롤러가 응답으로 바꾼다.
 * 여기 무언가 도착했다는 것은 버그이거나 인프라 장애라는 뜻이다 → docs/conventions.md §1
 */
@Catch()
export class UnhandledExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(UnhandledExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request & { id?: string }>();
    const traceId = request.id ?? 'unknown';

    if (exception instanceof HttpException) {
      // 프레임워크가 던지는 것들(404 라우트, 인증 실패 등)은 그대로 형식만 맞춘다.
      const status = exception.getStatus();

      response.status(status).json({
        type: `https://teetime.local/errors/http-${status}`,
        title: exception.name,
        status,
        detail: exception.message,
        traceId,
      });

      return;
    }

    this.logger.error({ err: exception, traceId }, '처리되지 않은 예외');

    response.status(500).json({
      type: 'https://teetime.local/errors/internal',
      title: 'InternalServerError',
      status: 500,
      // 내부 예외 메시지를 밖으로 내보내지 않는다. 추적은 traceId로 한다.
      detail: '요청을 처리하지 못했다.',
      traceId,
    });
  }
}
