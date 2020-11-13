import {CockroachDriver} from "../../driver/cockroachdb/CockroachDriver";
import {SapDriver} from "../../driver/sap/SapDriver";
import {ColumnMetadata} from "../../metadata/ColumnMetadata";
import {ObjectLiteral} from "../../common/ObjectLiteral";
import {QueryRunner} from "../../query-runner/QueryRunner";
import {SqlServerDriver} from "../../driver/sqlserver/SqlServerDriver";
import {PostgresDriver} from "../../driver/postgres/PostgresDriver";
import {UpdateResult} from "../result/UpdateResult";
import {ReturningResultsEntityUpdator} from "../ReturningResultsEntityUpdator";
import {MysqlDriver} from "../../driver/mysql/MysqlDriver";
import {BroadcasterResult} from "../../subscriber/BroadcasterResult";
import {OracleDriver} from "../../driver/oracle/OracleDriver";
import {UpdateValuesMissingError} from "../../error/UpdateValuesMissingError";
import {QueryDeepPartialEntity} from "../QueryPartialEntity";
import {AuroraDataApiDriver} from "../../driver/aurora-data-api/AuroraDataApiDriver";
import {ModificationQueryBuilder} from "./ModificationQueryBuilder";

/**
 * Allows to build complex sql queries in a fashion way and execute those queries.
 */
export class UpdateQueryBuilder<Entity> extends ModificationQueryBuilder<Entity, UpdateResult> {

    // -------------------------------------------------------------------------
    // Public Methods
    // -------------------------------------------------------------------------

    /**
     * Values needs to be updated.
     */
    set(values: QueryDeepPartialEntity<Entity>): this {
        this.expressionMap.valuesSet = values;
        return this;
    }

    // -------------------------------------------------------------------------
    // Protected Methods
    // -------------------------------------------------------------------------

    /**
     * Gets array of values need to be inserted into the target table.
     */
    protected getValueSet(): ObjectLiteral {
        if (this.expressionMap.valuesSet instanceof Object)
            return this.expressionMap.valuesSet;

        throw new UpdateValuesMissingError();
    }

    // -------------------------------------------------------------------------
    // Protected Implemented Methods
    // -------------------------------------------------------------------------

    /**
     * Creates UPDATE expression used to perform query.
     */
    protected createModificationExpression() {
        const valuesSet = this.getValueSet();
        const metadata = this.expressionMap.mainAlias!.hasMetadata ? this.expressionMap.mainAlias!.metadata : undefined;

        // prepare columns and values to be updated
        const updateColumnAndValues: string[] = [];
        const updatedColumns: ColumnMetadata[] = [];
        const newParameters: ObjectLiteral = {};
        let parametersCount = this.connection.driver.hasIndexedParameters()
            ? Object.keys(this.expressionMap.nativeParameters).length : 0;
        if (metadata) {
            metadata.extractColumnsInEntity(valuesSet).forEach(column => {
                if (!column.isUpdate) { return; }

                updatedColumns.push(column);

                const paramName = "upd_" + column.databaseName;

                let value = column.getEntityValue(valuesSet);
                if (column.referencedColumn && value instanceof Object) {
                    value = column.referencedColumn.getEntityValue(value);
                } else if (!(value instanceof Function)) {
                    value = this.connection.driver.preparePersistentValue(value, column);
                }

                // todo: duplication zone
                if (value instanceof Function) { // support for SQL expressions in update query
                    updateColumnAndValues.push(this.escape(column.databaseName) + " = " + value());
                } else if (this.connection.driver instanceof SapDriver && value === null) {
                    updateColumnAndValues.push(this.escape(column.databaseName) + " = NULL");
                } else {
                    if (this.connection.driver instanceof SqlServerDriver) {
                        value = this.connection.driver.parametrizeValue(column, value);
                    }

                    if (!this.connection.driver.hasIndexedParameters()) {
                        newParameters[paramName] = value;
                    } else {
                        this.expressionMap.nativeParameters[paramName] = value;
                    }

                    let expression = null;
                    if ((this.connection.driver instanceof MysqlDriver || this.connection.driver instanceof AuroraDataApiDriver) && this.connection.driver.spatialTypes.indexOf(column.type) !== -1) {
                        const useLegacy = this.connection.driver.options.legacySpatialSupport;
                        const geomFromText = useLegacy ? "GeomFromText" : "ST_GeomFromText";
                        if (column.srid != null) {
                            expression = `${geomFromText}(${this.connection.driver.createParameter(paramName, parametersCount++)}, ${column.srid})`;
                        } else {
                            expression = `${geomFromText}(${this.connection.driver.createParameter(paramName, parametersCount++)})`;
                        }
                    } else if (this.connection.driver instanceof PostgresDriver && this.connection.driver.spatialTypes.indexOf(column.type) !== -1) {
                        if (column.srid != null) {
                            expression = `ST_SetSRID(ST_GeomFromGeoJSON(${this.connection.driver.createParameter(paramName, parametersCount++)}), ${column.srid})::${column.type}`;
                        } else {
                            expression = `ST_GeomFromGeoJSON(${this.connection.driver.createParameter(paramName, parametersCount++)})::${column.type}`;
                        }
                    } else if (this.connection.driver instanceof SqlServerDriver && this.connection.driver.spatialTypes.indexOf(column.type) !== -1) {
                        expression = column.type + "::STGeomFromText(" + this.connection.driver.createParameter(paramName, parametersCount++) + ", " + (column.srid || "0") + ")";
                    } else {
                        expression = this.connection.driver.createParameter(paramName, parametersCount++);
                    }
                    updateColumnAndValues.push(this.escape(column.databaseName) + " = " + expression);
                }
            });

            if (metadata.versionColumn && !updatedColumns.includes(metadata.versionColumn))
                updateColumnAndValues.push(this.escape(metadata.versionColumn.databaseName) + " = " + this.escape(metadata.versionColumn.databaseName) + " + 1");
            if (metadata.updateDateColumn && !updatedColumns.includes(metadata.updateDateColumn))
                updateColumnAndValues.push(this.escape(metadata.updateDateColumn.databaseName) + " = CURRENT_TIMESTAMP"); // todo: fix issue with CURRENT_TIMESTAMP(6) being used, can "DEFAULT" be used?!

        } else {
            Object.keys(valuesSet).map(key => {
                let value = valuesSet[key];

                // todo: duplication zone
                if (value instanceof Function) { // support for SQL expressions in update query
                    updateColumnAndValues.push(this.escape(key) + " = " + value());
                } else if (this.connection.driver instanceof SapDriver && value === null) {
                    updateColumnAndValues.push(this.escape(key) + " = NULL");
                } else {

                    // we need to store array values in a special class to make sure parameter replacement will work correctly
                    // if (value instanceof Array)
                    //     value = new ArrayParameter(value);

                    if (!this.connection.driver.hasIndexedParameters()) {
                        newParameters[key] = value;
                    } else {
                        this.expressionMap.nativeParameters[key] = value;
                    }

                    updateColumnAndValues.push(this.escape(key) + " = " + this.connection.driver.createParameter(key, parametersCount++));
                }
            });
        }

        if (updateColumnAndValues.length <= 0) {
            throw new UpdateValuesMissingError();
        }

        // we re-write parameters this way because we want our "UPDATE ... SET" parameters to be first in the list of "nativeParameters"
        // because some drivers like mysql depend on order of parameters
        if (!this.connection.driver.hasIndexedParameters()) {
            this.expressionMap.nativeParameters = Object.assign(newParameters, this.expressionMap.nativeParameters);
        }

        // get a table name and all column database names
        const whereExpression = this.createWhereExpression();
        const returningExpression = this.createReturningExpression();

        // generate and return sql update query
        if (returningExpression && (this.connection.driver instanceof PostgresDriver || this.connection.driver instanceof OracleDriver || this.connection.driver instanceof CockroachDriver)) {
            return `UPDATE ${this.getTableName(this.getMainTableName())} SET ${updateColumnAndValues.join(", ")}${whereExpression} RETURNING ${returningExpression}`;
        } else if (returningExpression && this.connection.driver instanceof SqlServerDriver) {
            return `UPDATE ${this.getTableName(this.getMainTableName())} SET ${updateColumnAndValues.join(", ")} OUTPUT ${returningExpression}${whereExpression}`;
        } else {
            return `UPDATE ${this.getTableName(this.getMainTableName())} SET ${updateColumnAndValues.join(", ")}${whereExpression}`; // todo: how do we replace aliases in where to nothing?
        }
    }

    /**
     * Executes sql generated by query builder and returns raw database results.
     */
    protected async executeInsideTransaction(queryRunner: QueryRunner): Promise<UpdateResult> {
        let declareSql: string | null = null;
        let selectOutputSql: string | null = null;

        // if update entity mode is enabled we may need extra columns for the returning statement
        const returningResultsEntityUpdator = new ReturningResultsEntityUpdator(queryRunner, this.expressionMap);
        if (this.expressionMap.updateEntity === true &&
            this.expressionMap.mainAlias!.hasMetadata &&
            this.expressionMap.whereEntities.length > 0) {
            this.expressionMap.extraReturningColumns = returningResultsEntityUpdator.getUpdationReturningColumns();

            if (this.expressionMap.extraReturningColumns.length > 0 && this.connection.driver instanceof SqlServerDriver) {
                declareSql = this.connection.driver.buildTableVariableDeclaration("@OutputTable", this.expressionMap.extraReturningColumns);
                selectOutputSql = `SELECT * FROM @OutputTable`;
            }
        }

        // execute query
        const [updateSql, parameters] = this.getQueryAndParameters();
        const updateResult = new UpdateResult();
        const statements = [declareSql, updateSql, selectOutputSql];
        const result = await queryRunner.query(
            statements.filter(sql => sql != null).join(";\n\n"),
            parameters,
        );
        queryRunner.processUpdateQueryResult(result, updateResult);

        // if we are updating entities and entity updation is enabled we must update some of entity columns (like version, update date, etc.)
        if (this.expressionMap.updateEntity === true &&
            this.expressionMap.mainAlias!.hasMetadata &&
            this.expressionMap.whereEntities.length > 0) {
            await returningResultsEntityUpdator.update(updateResult, this.expressionMap.whereEntities);
        }

        return updateResult;
    }

    protected executeBeforeQueryBroadcast(queryRunner: QueryRunner, broadcastResult: BroadcasterResult) {
        queryRunner.broadcaster.broadcastBeforeUpdateEvent(broadcastResult, this.expressionMap.mainAlias!.metadata, this.expressionMap.valuesSet);
    }

    protected executeAfterQueryBroadcast(queryRunner: QueryRunner, broadcastResult: BroadcasterResult, result: UpdateResult) {
        queryRunner.broadcaster.broadcastAfterUpdateEvent(broadcastResult, this.expressionMap.mainAlias!.metadata);
    }
}
