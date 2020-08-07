import { SQLType } from "./columns";

type GenericParser<F, T> = {
    toJS: (data: F) => T,
    toSQL: (data: T) => F
};
type StringParser<T> = GenericParser<string, T>;
type BufferParser<T> = GenericParser<Buffer, T>;
type EnumParser<T> = {
    toJS: <E extends string>(data: E) => T,
    toSQL: <E extends string>(data: T) => E
};

export type AllTypes = {[key in SQLType]: unknown};
export type TypeParser<T extends AllTypes> = {
    integer: StringParser<T["integer"]>,
    biginteger: StringParser<T["biginteger"]>,
    text: StringParser<T["text"]>,
    float: StringParser<T["float"]>,
    boolean: StringParser<T["boolean"]>,
    date: StringParser<T["date"]>,
    datetime: StringParser<T["datetime"]>,
    time: StringParser<T["time"]>,
    timestamp: StringParser<T["timestamp"]>,
    binary: BufferParser<T["binary"]>,
    enum: StringParser<T["enum"]>, //TODO: change to enum parser
    json: StringParser<T["json"]>, //TODO: change to JSON parser
    uuid: StringParser<T["uuid"]>
};

export type DefaultTypes = {
    integer: number,
    biginteger: bigint,
    text: string,
    float: number,
    boolean: boolean,
    date: Date,
    datetime: Date,
    time: string,
    timestamp: Date,
    binary: Buffer,
    enum: string,
    json: string,
    uuid: string
};

export const defaultTypes: TypeParser<DefaultTypes> = {
    integer: {
        toSQL: (data: number) => data.toString(),
        toJS: Number.parseInt
    },
    biginteger: {
        toSQL: (data: bigint) => data.toString(),
        toJS: BigInt
    },
    text: {
        toSQL: (data: string) => data,
        toJS: (data: string) => data
    },
    float: {
        toSQL: (data: number) => data.toString(),
        toJS: Number
    },
    boolean: {
        toSQL: (data: boolean) => data.toString(),
        toJS: Boolean
    },
    date: {
        toSQL: (data: Date) => data.toISOString(),
        toJS: (data: string) => new Date(data)
    },
    datetime: {
        toSQL: (data: Date) => data.toISOString(),
        toJS: (data: string) => new Date(data)
    },
    time: {
        toSQL: (data: string) => data,
        toJS: (data: string) => data
    },
    timestamp: {
        toSQL: (data: Date) => data.toISOString(),
        toJS: (data: string) => new Date(data)
    },
    binary: {
        toSQL: (data: Buffer) => data,
        toJS: (data: Buffer) => data
    },
    enum: {
        toSQL: <E extends string>(data: E) => data,
        toJS: <E extends string>(data: E) => data
    },
    json: {
        toSQL: (data: string) => data,
        toJS: (data: string) => data
    },
    uuid: {
        toSQL: (data: string) => data,
        toJS: (data: string) => data
    }
};