/** Catalog 밖으로 전달하는 코스의 읽기 전용 정보. */
export type CourseSnapshot = {
  readonly courseId: string;
  readonly clubId: string;
  readonly name: string;
  readonly holeCount: number;
  /** 코스와 클럽이 모두 활성일 때만 true다. */
  readonly isActive: boolean;
  readonly timeZone: string;
};
