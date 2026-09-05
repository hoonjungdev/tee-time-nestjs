import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, type TransformFnParams } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

function parseBooleanQuery({ value }: TransformFnParams): unknown {
  if (value === undefined || typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export class ListCoursesQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  clubId?: string;

  @ApiPropertyOptional({ default: false, description: '비활성 코스와 클럽 포함 여부' })
  @IsOptional()
  @Transform(parseBooleanQuery)
  @IsBoolean()
  includeInactive?: boolean;
}
