"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.describeError = describeError;
function describeError(error) {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === "string") {
        return error;
    }
    try {
        return JSON.stringify(error) ?? "Unknown error";
    }
    catch {
        return "Unknown error";
    }
}
//# sourceMappingURL=error-utils.js.map