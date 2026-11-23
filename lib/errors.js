export class SheetOrmError extends Error {
  constructor(message) {
    super(message);
    this.name = new.target.name;
  }
}

export class SchemaError extends SheetOrmError {}
export class ValidationError extends SheetOrmError {}
export class NotFoundError extends SheetOrmError {}
export class NotSupportedError extends SheetOrmError {}
export class ForbiddenError extends SheetOrmError {}

export class TabNotFoundError extends SheetOrmError {
  constructor(tab) {
    super(`Tab "${tab}" not found; run db.migrate()`);
    this.code = "TAB_NOT_FOUND";
    this.tab = tab;
  }
}

export class ApiError extends SheetOrmError {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
