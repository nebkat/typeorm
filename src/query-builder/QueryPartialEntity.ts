import {BuildableExpression} from "../expression-builder/Expression";

/**
 * Make all properties in T optional
 */
export type QueryPartialEntity<T> = {
    [P in keyof T]?: T[P] | (() => string) | BuildableExpression;
};

/**
 * Make all properties in T optional. Deep version.
 */
export type QueryDeepPartialEntity<T> = {
    [P in keyof T]?:
        (
            T[P] extends Array<infer U> ? Array<QueryDeepPartialEntity<U>> :
            T[P] extends ReadonlyArray<infer U> ? ReadonlyArray<QueryDeepPartialEntity<U>> :
            QueryDeepPartialEntity<T[P]>
        ) | (() => string) | BuildableExpression;
};
