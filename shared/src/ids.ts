export type Brand<T, B extends string> = T & { readonly __brand: B };

export type PlayerId = Brand<string, "PlayerId">;
export type UnitInstanceId = Brand<string, "UnitInstanceId">;
export type ProjectileId = Brand<string, "ProjectileId">;
export type TowerId = Brand<string, "TowerId">;

export type Side = "left" | "right";
