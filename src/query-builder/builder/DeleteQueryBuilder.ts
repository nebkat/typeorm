import {EntityTarget} from "../../common/EntityTarget";
import {QueryRunner} from "../../query-runner/QueryRunner";
import {DeleteResult} from "../result/DeleteResult";
import {BroadcasterResult} from "../../subscriber/BroadcasterResult";
import {EntitySchema} from "../../index";
import {AbstractModifyQueryBuilder} from "./AbstractModifyQueryBuilder";

/**
 * Allows to build complex sql queries in a fashion way and execute those queries.
 */
export class DeleteQueryBuilder<Entity> extends AbstractModifyQueryBuilder<Entity, DeleteResult> {

    // -------------------------------------------------------------------------
    // Public Methods
    // -------------------------------------------------------------------------

    /**
     * Specifies FROM which entity's table select/update/delete will be executed.
     * Also sets a main string alias of the selection data.
     */
    from<T>(entityTarget: EntityTarget<T>, aliasName?: string): DeleteQueryBuilder<T> {
        entityTarget = entityTarget instanceof EntitySchema ? entityTarget.options.name : entityTarget;
        const mainAlias = this.createFromAlias(entityTarget, aliasName);
        this.expressionMap.setMainAlias(mainAlias);
        return (this as any) as DeleteQueryBuilder<T>;
    }

    // -------------------------------------------------------------------------
    // Protected Implemented Methods
    // -------------------------------------------------------------------------

    /**
     * Creates DELETE expression used to perform query.
     */
    protected createModificationExpression() {
        const tableName = this.getTableName(this.getMainTableName());
        const whereExpression = this.createWhereExpression();

        const query = ["DELETE FROM", tableName];

        // add OUTPUT expression
        if (this.connection.driver.config.returningClause === "output") {
            const returningExpression = this.createReturningExpression();
            if (returningExpression) query.push("OUTPUT", returningExpression);
        }

        // add WHERE expression
        if (whereExpression) query.push(whereExpression);

        // add RETURNING expression
        if (this.connection.driver.config.returningClause === "returning") {
            const returningExpression = this.createReturningExpression();
            if (returningExpression) query.push("RETURNING", returningExpression);
        }

        return query.join(" ");
    }

    /**
     * Executes sql generated by query builder and returns raw database results.
     */
    protected async executeInsideTransaction(queryRunner: QueryRunner): Promise<DeleteResult> {
        const [sql, parameters] = this.getQueryAndParameters();
        const deleteResult = new DeleteResult();
        const result = await queryRunner.query(sql, parameters);
        queryRunner.processDeleteQueryResult(result, deleteResult);
        return deleteResult;
    }

    protected executeBeforeQueryBroadcast(queryRunner: QueryRunner, broadcastResult: BroadcasterResult) {
        queryRunner.broadcaster.broadcastBeforeRemoveEvent(broadcastResult, this.expressionMap.mainAlias!.metadata);
    }

    protected executeAfterQueryBroadcast(queryRunner: QueryRunner, broadcastResult: BroadcasterResult, result: DeleteResult) {
        queryRunner.broadcaster.broadcastAfterRemoveEvent(broadcastResult, this.expressionMap.mainAlias!.metadata);
    }
}
