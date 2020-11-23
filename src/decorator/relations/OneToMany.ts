import {ObjectType, RelationOptions} from "../../";
import {Relation} from "./Relation";

/**
 * One-to-many relation allows to create type of relation when Entity1 can have multiple instances of Entity2.
 * Entity2 have only one Entity1. Entity2 is an owner of the relationship, and storages Entity1 id on its own side.
 */
export function OneToMany<T>(typeFunctionOrTarget: string|((type?: any) => ObjectType<T>), inverseSideProperty: string|((object: T) => any), options?: RelationOptions): PropertyDecorator {
    return Relation<T>("one-to-many", typeFunctionOrTarget, inverseSideProperty, options);
}
