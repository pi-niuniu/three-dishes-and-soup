/**
 * 微信小程序全局类型定义
 */
declare function App<T = any>(options: T): void;
declare function Page<T = any>(options: T): void;
declare function Component<T = any>(options: T): void;
declare function getApp<T = any>(): T;
declare const wx: any;
declare function getCurrentPages(): any[];

