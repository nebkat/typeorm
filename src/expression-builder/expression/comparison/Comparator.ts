import {OperatorBuilder, OperatorGen} from "../Operator";
import {Expression} from "../../Expression";
import {ColumnBuilder} from "../Column";
import {QuantifierBuildable} from "./quantifier/Quantifier";
import {ValueTransformer} from "../../../decorator/options/ValueTransformer";
import {ApplyValueTransformers} from "../../../util/ApplyValueTransformers";

export const ComparatorGen = OperatorGen;

export abstract class ComparatorBuilder extends OperatorBuilder<[Expression, Expression | QuantifierBuildable]> {
    get columnComparator(): boolean {
        return this.operands[0] instanceof ColumnBuilder && this.operands[0].column === undefined;
    }

    get negatedOperands(): [Expression, Expression | QuantifierBuildable] {
        return [this.operands[0], this.operands[1] instanceof QuantifierBuildable ? this.operands[1].negate() : this.operands[1]];
    }

    applyValueTransformers(
        this: ComparatorBuilder & {
            constructor: { new (operands: [Expression, Expression | QuantifierBuildable]): ComparatorBuilder },
        }, transformer: ValueTransformer | ValueTransformer[]) {
        return new (this.constructor)(<[Expression, Expression]>this.operands.map(operand => ApplyValueTransformers.transformTo(transformer, operand)));
    }
}
