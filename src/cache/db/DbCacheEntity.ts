import {Column} from "../..";

export class DbCacheEntity {
    @Column({
        type: "typeorm:cacheId",
        generated: "increment",
        primary: true
    }) id: number;

    @Column({type: "typeorm:cacheIdentifier", nullable: true}) identifier: string;
    @Column({type: "typeorm:cacheTime"}) time: number;
    @Column({type: "typeorm:cacheDuration"}) duration: number;
    @Column({type: "typeorm:cacheQuery"}) query: string;

    @Column({type: "typeorm:cacheResult"}) result: any;
}
