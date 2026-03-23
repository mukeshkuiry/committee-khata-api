export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'GROUP_NOT_FOUND'
  | 'MEMBER_NOT_FOUND'
  | 'LOAN_NOT_FOUND'
  | 'BAD_REQUEST'
  | 'MEMBERS_LOCKED'
  | 'DUPLICATE_MEMBER_NAME'
  | 'INSUFFICIENT_GROUP_BALANCE'
  | 'GROUP_NOT_COMPLETED'
  | 'GROUP_HAS_DUES'
  | 'NEXT_MONTH_NOT_ALLOWED_TODAY'
  | 'NO_MEMBERS_IN_GROUP';

export class HttpError extends Error {
  public status: number;
  public code: ErrorCode;

  constructor(status: number, code: ErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
