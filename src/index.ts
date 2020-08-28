import { Column, DBBigIncrements, DBBigInteger, DBBinary, DBBoolean, DBDate, DBEnum, DBFloat, DBInteger, DBIncrements, DBJson, DBJsonB, DBString, DBText, DBTime, DBTimestamp } from "./columns"

export { database as db } from "./database";
export { parameters as $ } from "./utils";
export { Model, generateMigration, schema, isSchema, Schema } from "./model";
export const types = {
    Column: Column,
    BigIncrements: DBBigIncrements,
    BigInteger: DBBigInteger,
    Binary: DBBinary,
    Boolean: DBBoolean,
    Date: DBDate,
    Enum: DBEnum,
    Float: DBFloat,
    Integer: DBInteger,
    Increments: DBIncrements,
    Json: DBJson,
    JsonB: DBJsonB,
    String: DBString,
    Text: DBText,
    Time: DBTime,
    Timestamp: DBTimestamp,
};
export { defaultTypes, TypeParser } from "./types";
