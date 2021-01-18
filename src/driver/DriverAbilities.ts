export interface DriverAbilities {
    multiDatabase?: boolean;

    checkConstraints?: boolean;
    exclusionConstraints?: boolean;
    uniqueConstraints?: boolean;

    insertDefaultValue?: boolean;
    insertIgnoreModifier?: boolean;
    insertEmptyColumnsValuesList?: boolean;

    distinctOnClause?: boolean;
    limitClauseOnModify?: boolean;

    returningOutputClause?: boolean;
    returningClause?: boolean;
    outputClause?: boolean;

    ilikeOperator?: boolean;
    concatOperator?: boolean;

    uuidGeneration?: boolean;

    fullTextColumnType?: boolean;

    generators: {
        limitOffsetExpression(offset?: number, limit?: number): string;
        lockExpression(lockMode: string): string;
        selectWithLockExpression?(lockMode?: string): string;

        insertOnConflict?(onConflict?: string, onIgnore?: string|boolean, onUpdate?: { columns?: string, conflict?: string, overwrite?: string }): string[] | null;
    }
}
