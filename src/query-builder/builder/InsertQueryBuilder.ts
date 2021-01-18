import {CockroachDriver} from "../../driver/cockroachdb/CockroachDriver";
import {ObjectLiteral} from "../../common/ObjectLiteral";
import {EntityTarget} from "../../common/EntityTarget";
import {QueryDeepPartialEntity} from "../QueryPartialEntity";
import {SqlServerDriver} from "../../driver/sqlserver/SqlServerDriver";
import {PostgresDriver} from "../../driver/postgres/PostgresDriver";
import {MysqlDriver} from "../../driver/mysql/MysqlDriver";
import {InsertResult} from "../result/InsertResult";
import {InsertValuesMissingError} from "../../error/InsertValuesMissingError";
import {ColumnMetadata} from "../../metadata/ColumnMetadata";
import {ReturningResultsEntityUpdater} from "../ReturningResultsEntityUpdater";
import {AbstractSqliteDriver} from "../../driver/sqlite-abstract/AbstractSqliteDriver";
import {BroadcasterResult} from "../../subscriber/BroadcasterResult";
import {EntitySchema} from "../../entity-schema/EntitySchema";
import {OracleDriver} from "../../driver/oracle/OracleDriver";
import {AuroraDataApiDriver} from "../../driver/aurora-data-api/AuroraDataApiDriver";
import {QueryRunner} from "../..";
import {AbstractPersistQueryBuilder} from "./AbstractPersistQueryBuilder";

/**
 * Allows to build complex sql queries in a fashion way and execute those queries.
 */
export class InsertQueryBuilder<Entity> extends AbstractPersistQueryBuilder<Entity, InsertResult> {

    // -------------------------------------------------------------------------
    // Public Implemented Methods
    // -------------------------------------------------------------------------

    /**
     * Gets generated sql query without parameters being replaced.
     */
    getQuery(): string {
        return [this.createComment(), this.createInsertExpression()].filter(q => q).join(" ");
    }

    /**
     * Executes sql generated by query builder and returns raw database results.
     */
    async execute(): Promise<InsertResult> {
        // If user passed empty array of entities then we don't need to do
        // anything.
        //
        // Fixes GitHub issues #3111 and #5734. If we were to let this through
        // we would run into problems downstream, like subscribers getting
        // invoked with the empty array where they expect an entity, and SQL
        // queries with an empty VALUES clause.
        if (this.getValueSets().length === 0)
            return new InsertResult();

        return super.execute();
    }

    // -------------------------------------------------------------------------
    // Public Methods
    // -------------------------------------------------------------------------

    /**
     * Specifies INTO which entity's table insertion will be executed.
     */
    into<T>(entityTarget: EntityTarget<T>, columns?: string[]): InsertQueryBuilder<T> {
        entityTarget = entityTarget instanceof EntitySchema ? entityTarget.options.name : entityTarget;
        const mainAlias = this.createFromAlias(entityTarget);
        this.expressionMap.setMainAlias(mainAlias);
        this.expressionMap.insertColumns = columns || [];
        return (this as any) as InsertQueryBuilder<T>;
    }

    /**
     * Values needs to be inserted into table.
     */
    values(values: QueryDeepPartialEntity<Entity>|QueryDeepPartialEntity<Entity>[]): this {
        this.expressionMap.valuesSet = values;
        return this;
    }

    /**
     * Adds additional ON CONFLICT statement supported in postgres and cockroach.
     */
    onConflict(statement: string): this {
        this.expressionMap.onConflict = statement;
        return this;
    }

    /**
     * Adds additional ignore statement supported in databases.
     */
    orIgnore(statement: string | boolean = true): this {
        this.expressionMap.onIgnore = statement;
        return this;
    }

    /**
     * Adds additional update statement supported in databases.
     */
    orUpdate(statement?: { columns?: string[], overwrite?: string[], conflict_target?: string | string[] }): this {
      this.expressionMap.onUpdate = {};
      if (statement && Array.isArray(statement.conflict_target))
          this.expressionMap.onUpdate.conflict = ` ( ${statement.conflict_target.join(", ")} ) `;
      if (statement && typeof statement.conflict_target === "string")
          this.expressionMap.onUpdate.conflict = ` ON CONSTRAINT ${statement.conflict_target} `;
      if (statement && Array.isArray(statement.columns))
          this.expressionMap.onUpdate.columns = statement.columns.map(column => `${column} = :${column}`).join(", ");
      if (statement && Array.isArray(statement.overwrite)) {
        if (this.connection.driver instanceof MysqlDriver || this.connection.driver instanceof AuroraDataApiDriver) {
          this.expressionMap.onUpdate.overwrite = statement.overwrite.map(column => `${column} = VALUES(${column})`).join(", ");
        } else if (this.connection.driver instanceof PostgresDriver || this.connection.driver instanceof AbstractSqliteDriver || this.connection.driver instanceof CockroachDriver) {
          this.expressionMap.onUpdate.overwrite = statement.overwrite.map(column => `${column} = EXCLUDED.${column}`).join(", ");
        }
      }
      return this;
    }


    // -------------------------------------------------------------------------
    // Protected Methods
    // -------------------------------------------------------------------------

    /**
     * Creates INSERT express used to perform insert query.
     */
    protected createInsertExpression() {
        const tableName = this.getTableName(this.getMainTableName());
        const oracleMultiRowInsert = this.connection.driver instanceof OracleDriver && this.getValueSets().length > 1;
        const valuesExpression = this.createValuesExpression(); // its important to get values before returning expression because oracle rely on native parameters and ordering of them is important
        const columnsExpression = this.createColumnNamesExpression();

        const query = ["INSERT"];

        if (this.connection.driver.abilities.insertIgnoreModifier && this.expressionMap.onIgnore) query.push("IGNORE");

        query.push("INTO", tableName);

        // add columns expression
        if (columnsExpression) {
            query.push(`(${columnsExpression})`);
        } else if (!valuesExpression && this.connection.driver.abilities.insertEmptyColumnsValuesList) {
            query.push("()");
        }

        // add OUTPUT expression
        if (this.connection.driver.abilities.outputClause) {
            const returningExpression = this.createReturningExpression();
            if (returningExpression) query.push("OUTPUT", returningExpression);
        }

        // add VALUES expression
        if (valuesExpression) {
            if (!(oracleMultiRowInsert)) query.push("VALUES");
            query.push(valuesExpression);
        } else {
            if (this.connection.driver.abilities.insertEmptyColumnsValuesList) {
                query.push("VALUES ()");
            } else {
                query.push("DEFAULT VALUES");
            }
        }

        const conflictExpressions = this.connection.driver.abilities.generators.insertOnConflict ?
            this.connection.driver.abilities.generators.insertOnConflict(this.expressionMap.onConflict, this.expressionMap.onIgnore, this.expressionMap.onUpdate) : undefined;
        if (conflictExpressions) query.push(...conflictExpressions);

        // add RETURNING expression
        if (this.connection.driver.abilities.returningClause) {
            const returningExpression = this.createReturningExpression();
            if (returningExpression) query.push("RETURNING", returningExpression);
        }

        return query.join(" ");
    }

    /**
     * Gets list of columns or raw object keys where values must be inserted to.
     */
    protected getInsertedColumnsOrKeys(): string[] | ColumnMetadata[] {
        if (this.expressionMap.mainAlias!.hasMetadata) {
            // Entity metadata is available, filter insertable columns
            return this.expressionMap.mainAlias!.metadata.columns.filter(column => {
                // if user specified list of columns he wants to insert to, then we filter only them
                if (this.expressionMap.insertColumns.length > 0)
                    return this.expressionMap.insertColumns.includes(column.propertyPath);

                // skip columns the user doesn't want included by default
                if (!column.isInsert) { return false; }

                // if user did not specified such list then return all columns except auto-increment one
                // for Oracle we return auto-increment column as well because Oracle does not support DEFAULT VALUES expression
                if (column.isGenerated && column.generationStrategy === "increment"
                    && !(this.connection.driver instanceof OracleDriver)
                    && !(this.connection.driver instanceof AbstractSqliteDriver)
                    && !(this.connection.driver instanceof MysqlDriver)
                    && !(this.connection.driver instanceof AuroraDataApiDriver))
                    return false;

                return true;
            });
        } else if (this.expressionMap.insertColumns.length > 0) {
            // No entity metadata available but columns provided, treat them as raw columns (and object keys)
            return this.expressionMap.insertColumns;
        } else {
            // No entity metadata and no specific columns provided, treat every object key as a raw column
            const valueSets = this.getValueSets();

            // Put all object keys in an array then extract unique values
            const allObjectKeys: string[] = [];
            valueSets.forEach(valueSet => {
                allObjectKeys.push(...Object.keys(valueSet));
            });
            return [...new Set(allObjectKeys)];
        }
    }

    /**
     * Creates a columns string where values must be inserted to for INSERT INTO expression.
     */
    protected createColumnNamesExpression(): string {
        const columns: (string | ColumnMetadata)[] = this.getInsertedColumnsOrKeys();
        return columns.map(column => {
            if (column instanceof ColumnMetadata) column = column.databaseName;
            return this.escape(column);
        }).join(", ");
    }

    /**
     * Creates list of values needs to be inserted in the VALUES expression.
     */
    protected createValuesExpression(): string {
        const valueSets = this.getValueSets();
        const columnsOrKeys: (string | ColumnMetadata)[] = this.getInsertedColumnsOrKeys();

        let parametersCount = Object.keys(this.expressionMap.nativeParameters).length;
        const valueSetExpressions = valueSets.map((valueSet, valueSetIndex) => {
            const columnExpressions = columnsOrKeys.map(columnOrKey => {
                const column = columnOrKey instanceof ColumnMetadata ? columnOrKey : undefined;
                const columnName = column ? column.databaseName : columnOrKey as string;
                const value = column ? column.getEntityValue(valueSet) : valueSet[columnOrKey as string];

                const createParamExpression = (value: any, specialName?: string) => {
                    let paramName = `i${valueSetIndex}_${columnName}`; // TODO: Improve naming
                    if (specialName === "uuid") {
                        paramName = ReturningResultsEntityUpdater.generateUUIDParameterName(columnName, valueSetIndex);
                    } else if (specialName === "discriminator") {
                        paramName = `discriminator_value_${parametersCount}`; // TODO: Not used anywhere else, is special name needed?
                    }

                    this.expressionMap.nativeParameters[paramName] = value;
                    return this.connection.driver.createParameter(paramName, parametersCount++);
                };

                return this.computePersistValueExpression(column, value, createParamExpression);
            });

            // Filter out if no values are specified
            if (columnExpressions.length === 0) return null;

            if (this.connection.driver instanceof OracleDriver && valueSets.length > 1) {
                return `SELECT ${columnExpressions.join(", ")} FROM DUAL`;
            } else {
                return `(${columnExpressions.join(", ")})`;
            }
        }).filter(expression => expression !== null);

        if (this.connection.driver instanceof OracleDriver && valueSets.length > 1) {
            return valueSetExpressions.join(" UNION ALL ");
        } else {
            return valueSetExpressions.join(", ");
        }
    }

    /**
     * Gets array of values need to be inserted into the target table.
     */
    protected getValueSets(): ObjectLiteral[] {
        if (Array.isArray(this.expressionMap.valuesSet))
            return this.expressionMap.valuesSet;

        if (this.expressionMap.valuesSet instanceof Object)
            return [this.expressionMap.valuesSet];

        throw new InsertValuesMissingError();
    }

    // -------------------------------------------------------------------------
    // Protected Implemented Methods
    // -------------------------------------------------------------------------

    /**
     * Executes sql generated by query builder and returns raw database results.
     */
    protected async executeInsideTransaction(queryRunner: QueryRunner) {
        const valueSets: ObjectLiteral[] = this.getValueSets();

        let declareSql: string | null = null;
        let selectOutputSql: string | null = null;

        // if update entity mode is enabled we may need extra columns for the returning statement
        const returningResultsEntityUpdater = new ReturningResultsEntityUpdater(queryRunner, this.expressionMap);
        if (this.expressionMap.updateEntity === true && this.expressionMap.mainAlias!.hasMetadata) {
            if (!(valueSets.length > 1 && this.connection.driver instanceof OracleDriver)) {
                this.expressionMap.extraReturningColumns = returningResultsEntityUpdater.getInsertionReturningColumns();
            }
            if (this.expressionMap.extraReturningColumns.length > 0 && this.connection.driver instanceof SqlServerDriver) {
                declareSql = this.connection.driver.buildTableVariableDeclaration("@OutputTable", this.expressionMap.extraReturningColumns);
                selectOutputSql = `SELECT * FROM @OutputTable`;
            }
        }

        // execute query
        const [insertSql, parameters] = this.getQueryAndParameters();

        const statements = [declareSql, insertSql, selectOutputSql];
        const insertResult = new InsertResult();
        const result = await queryRunner.query(
            statements.filter(sql => sql != null).join(";\n\n"),
            parameters,
        );
        queryRunner.processInsertQueryResult(result, insertResult);

        // load returning results and set them to the entity if entity updation is enabled
        if (this.expressionMap.updateEntity === true && this.expressionMap.mainAlias!.hasMetadata) {
            await returningResultsEntityUpdater.insert(insertResult, valueSets);
        }

        return insertResult;
    }

    protected executeBeforeQueryBroadcast(queryRunner: QueryRunner, broadcastResult: BroadcasterResult) {
        this.getValueSets().forEach(valueSet => {
            queryRunner.broadcaster.broadcastBeforeInsertEvent(broadcastResult, this.expressionMap.mainAlias!.metadata, valueSet);
        });
    }

    protected executeAfterQueryBroadcast(queryRunner: QueryRunner, broadcastResult: BroadcasterResult, result: InsertResult) {
        this.getValueSets().forEach(valueSet => {
            queryRunner.broadcaster.broadcastAfterInsertEvent(broadcastResult, this.expressionMap.mainAlias!.metadata, valueSet);
        });
    }
}
