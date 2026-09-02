import { Module } from '@nestjs/common';

/**
 * 이벤트 소비자.
 *
 * 이 패키지에서 공개되는 유일한 심볼이다. 컨트롤러·핸들러·엔티티는 전부 내부이며
 * `exports` 필드가 서브패스를 열지 않으므로 밖에서 참조할 수 없다 → docs/modules.md
 */
@Module({})
export class NotificationModule {}
