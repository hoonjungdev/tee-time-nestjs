import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { httpStatusFor, toProblemDetails, type ProblemDetails } from '@teetime/shared-kernel';
import type { Request, Response } from 'express';

import { OperatingRuleResponse } from '../create-operating-rule/create-operating-rule.contracts.js';
import { ListOperatingRulesQuery } from './list-operating-rules.contracts.js';
import { ListOperatingRulesHandler } from './list-operating-rules.handler.js';

@ApiTags('admin/operating-rules')
@Controller('api/admin/operating-rules')
// AdminGuard는 의도적으로 붙이지 않는다. M3에서 도입한다(D1).
export class ListOperatingRulesController {
  constructor(private readonly handler: ListOperatingRulesHandler) {}

  @Get()
  @ApiOkResponse({ type: OperatingRuleResponse, isArray: true })
  async list(
    @Query() query: ListOperatingRulesQuery,
    @Req() req: Request & { id?: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<OperatingRuleResponse[] | ProblemDetails> {
    const result = await this.handler.handle(query);

    if (!result.ok) {
      res.status(httpStatusFor(result.error.code));
      return toProblemDetails(result.error, req.id ?? 'unknown');
    }

    return result.value;
  }
}
