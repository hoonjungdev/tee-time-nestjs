import { Module } from '@nestjs/common';
import { BookingModule } from '@teetime/booking';
import { CatalogModule } from '@teetime/catalog';
import { IdentityModule } from '@teetime/identity';
import { NotificationModule } from '@teetime/notification';
import { PaymentModule } from '@teetime/payment';
import { LoggerModule } from 'nestjs-pino';

/**
 * 호스트는 조립만 한다. **비즈니스 로직을 두지 않는다.**
 *
 * 모듈을 명시적으로 나열하는 이유는 조립 순서와 구성이 코드에 보이게 하기 위함이다.
 * 디렉터리를 훑어 자동 등록하면 무엇이 떠 있는지 파일을 열어봐야 알 수 있다.
 */
@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        // 비밀번호·토큰이 로그에 남지 않게 한다 → docs/conventions.md §8
        redact: ['req.headers.authorization', 'req.body.password', 'req.body.passwordConfirm'],
        // exactOptionalPropertyTypes를 켠 상태에서 `transport: undefined`는 할당할 수 없다.
        // 키 자체를 넣지 않는 것과 undefined를 넣는 것은 다른 일이며, 그 구분이 의도다.
        ...(process.env['NODE_ENV'] === 'production'
          ? {}
          : {
              transport: {
                target: 'pino-pretty',
                options: { singleLine: true, translateTime: 'HH:MM:ss' },
              },
            }),
      },
    }),
    CatalogModule,
    BookingModule,
    PaymentModule,
    IdentityModule,
    NotificationModule,
  ],
})
export class AppModule {}
