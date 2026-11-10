// The public face of the sign-in module. Other modules import only from here. Nothing is exported yet: the signed-in
// person arrives on every request as `request.principal` and `request.requestContext` (set by the kernel's guard).
export {};
