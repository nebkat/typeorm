import {ObjectType, RelationOptions} from "../../";
import {Relation} from "./Relation";

/**
 * Many-to-one relation allows to create type of relation when Entity1 can have single instance of Entity2, but
 * Entity2 can have a multiple instances of Entity1. Entity1 is an owner of the relationship, and storages Entity2 id
 * on its own side.
 */
export function ManyToOne<T>(typeFunctionOrTarget: string|((type?: any) => ObjectType<T>), options?: RelationOptions): PropertyDecorator;

/**
 * Many-to-one relation allows to create type of relation when Entity1 can have single instance of Entity2, but
 * Entity2 can have a multiple instances of Entity1. Entity1 is an owner of the relationship, and storages Entity2 id
 * on its own side.
 */
export function ManyToOne<T>(typeFunctionOrTarget: string|((type?: any) => ObjectType<T>),
                             inverseSide?: string|((object: T) => any),
                             options?: RelationOptions): PropertyDecorator;

/**
 * Many-to-one relation allows to create type of relation when Entity1 can have single instance of Entity2, but
 * Entity2 can have a multiple instances of Entity1. Entity1 is an owner of the relationship, and storages Entity2 id
 * on its own side.
 */
export function ManyToOne<T>(typeFunctionOrTarget: string|((type?: any) => ObjectType<T>),
                             inverseSideOrOptions?: string|((object: T) => any)|RelationOptions,
                             options?: RelationOptions): PropertyDecorator {
    return Relation<T>("many-to-one", typeFunctionOrTarget, inverseSideOrOptions, options);
}
