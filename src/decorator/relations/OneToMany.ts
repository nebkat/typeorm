import {ObjectType, RelationOptions} from "../../";
import {Relation} from "./Relation";

/**
 * One-to-many relation allows us to create a type of relation where Entity1 can have multiple instances of Entity2.
 * Entity2 has only one Entity1. Entity2 is the owner of the relationship and stores Entity1's id on its own side.
 */
export function OneToMany<T>(typeFunctionOrTarget: string|((type?: any) => ObjectType<T>), inverseSideProperty: string|((object: T) => any), options?: RelationOptions): PropertyDecorator {
    return Relation<T>("one-to-many", typeFunctionOrTarget, inverseSideProperty, options);
}
