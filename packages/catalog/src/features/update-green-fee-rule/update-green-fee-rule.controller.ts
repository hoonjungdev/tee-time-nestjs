import { Body, Controller, Param, ParseUUIDPipe, Patch, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { httpStatusFor, toProblemDetails, type ProblemDetails } from '@teetime/shared-kernel';
import type { Request, Response } from 'express';

import { GreenFeeRuleResponse } from '../create-green-fee-rule/create-green-fee-rule.contracts.js';
import { UpdateGreenFeeRuleRequest } from './update-green-fee-rule.contracts.js';
import { UpdateGreenFeeRuleHandler } from './update-green-fee-rule.handler.js';

@ApiTags('admin/green-fee-rules')
@Controller('api/admin/green-fee-rules')
// AdminGuard는 의도적으로 붙이지 않는다. M3에서 도입한다(D1).
export class UpdateGreenFeeRuleController {
  constructor(private readonly handler: UpdateGreenFeeRuleHandler) {}

  @Patch(':greenFeeRuleId')
  @ApiOkResponse({ type: GreenFeeRuleResponse })
  async update(
    @Param('greenFeeRuleId', ParseUUIDPipe) greenFeeRuleId: string,
    @Body() request: UpdateGreenFeeRuleRequest,
    @Req() req: Request & { id?: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<GreenFeeRuleResponse | ProblemDetails> {
    const result = await this.handler.handle(greenFeeRuleId, request);

    if (!result.ok) {
      res.status(httpStatusFor(result.error.code));
      return toProblemDetails(result.error, req.id ?? 'unknown');
    }

    return result.value;
  }
}
