import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { httpStatusFor, toProblemDetails, type ProblemDetails } from '@teetime/shared-kernel';
import type { Request, Response } from 'express';

import { GreenFeeRuleResponse } from '../create-green-fee-rule/create-green-fee-rule.contracts.js';
import { ListGreenFeeRulesQuery } from './list-green-fee-rules.contracts.js';
import { ListGreenFeeRulesHandler } from './list-green-fee-rules.handler.js';

@ApiTags('admin/green-fee-rules')
@Controller('api/admin/green-fee-rules')
// AdminGuard는 의도적으로 붙이지 않는다. M3에서 도입한다(D1).
export class ListGreenFeeRulesController {
  constructor(private readonly handler: ListGreenFeeRulesHandler) {}

  @Get()
  @ApiOkResponse({ type: GreenFeeRuleResponse, isArray: true })
  async list(
    @Query() query: ListGreenFeeRulesQuery,
    @Req() req: Request & { id?: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<GreenFeeRuleResponse[] | ProblemDetails> {
    const result = await this.handler.handle(query);

    if (!result.ok) {
      res.status(httpStatusFor(result.error.code));
      return toProblemDetails(result.error, req.id ?? 'unknown');
    }

    return result.value;
  }
}
