import {ObjectType, RelationOptions} from "../../";
import {Relation} from "./Relation";

/**
 * A one-to-many relation allows creating the type of relation where Entity1 can have multiple instances of Entity2,
 * but Entity2 has only one Entity1. Entity2 is the owner of the relationship, and stores the id of Entity1 on its
 * side of the relation.
 */
export function OneToMany<T>(typeFunctionOrTarget: string|((type?: any) => ObjectType<T>), inverseSideProperty: string|((object: T) => any), options?: RelationOptions): PropertyDecorator {
    return Relation<T>("one-to-many", typeFunctionOrTarget, inverseSideProperty, options);
}
