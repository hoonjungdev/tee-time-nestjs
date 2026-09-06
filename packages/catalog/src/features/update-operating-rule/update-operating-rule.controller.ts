import { Body, Controller, Param, ParseUUIDPipe, Patch, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { httpStatusFor, toProblemDetails, type ProblemDetails } from '@teetime/shared-kernel';
import type { Request, Response } from 'express';

import { OperatingRuleResponse } from '../create-operating-rule/create-operating-rule.contracts.js';
import { UpdateOperatingRuleRequest } from './update-operating-rule.contracts.js';
import { UpdateOperatingRuleHandler } from './update-operating-rule.handler.js';

@ApiTags('admin/operating-rules')
@Controller('api/admin/operating-rules')
// AdminGuard는 의도적으로 붙이지 않는다. M3에서 도입한다(D1).
export class UpdateOperatingRuleController {
  constructor(private readonly handler: UpdateOperatingRuleHandler) {}

  @Patch(':operatingRuleId')
  @ApiOkResponse({ type: OperatingRuleResponse })
  async update(
    @Param('operatingRuleId', ParseUUIDPipe) operatingRuleId: string,
    @Body() request: UpdateOperatingRuleRequest,
    @Req() req: Request & { id?: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<OperatingRuleResponse | ProblemDetails> {
    const result = await this.handler.handle(operatingRuleId, request);

    if (!result.ok) {
      res.status(httpStatusFor(result.error.code));
      return toProblemDetails(result.error, req.id ?? 'unknown');
    }

    return result.value;
  }
}
