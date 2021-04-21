import { ExpressionBuildInterface } from "./ExpressionBuildInterface";
import {ValueTransformer} from "../decorator/options/ValueTransformer";

export function Exp(expression: Expression) {
    return new WrappedExpressionBuilder(expression);
}

export type Expression = any | ExpressionBuilder;

export abstract class BuildableExpression {
    abstract build(eb: ExpressionBuildInterface, ctx: any): string;
}

export abstract class ExpressionBuilder extends BuildableExpression {
    abstract build(eb: ExpressionBuildInterface, ctx: any): string;
    negate?: () => Expression;

    applyValueTransformers?(transformer: ValueTransformer | ValueTransformer[]): ExpressionBuilder;

    get columnComparator(): boolean { return false; };
}

export class WrappedExpressionBuilder extends ExpressionBuilder {
    constructor(readonly expression: Expression) {
        super();
    }

    build(eb: ExpressionBuildInterface, ctx: any): string {
        return eb.buildExpression(ctx, this.expression);
    }
}
