import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsString, Length, ValidateIf } from 'class-validator';

export class UpdateCourseRequest {
  @ApiPropertyOptional()
  @ValidateIf((_target, value: unknown) => value !== undefined)
  @IsString()
  @Length(1, 100)
  name?: string;

  @ApiPropertyOptional({ enum: [9, 18] })
  @ValidateIf((_target, value: unknown) => value !== undefined)
  @IsInt()
  @IsIn([9, 18])
  holeCount?: number;

  @ApiPropertyOptional()
  @ValidateIf((_target, value: unknown) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
