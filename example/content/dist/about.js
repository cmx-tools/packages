import { __registerExternal, jsx, jsxs } from "cmx-runtime/jsx-runtime";
const Header$1 = __registerExternal({
	from: "@example/ui-library",
	import: "Header"
});
const UserProfile = __registerExternal({
	from: "@example/backend-contract",
	import: "UserProfile"
});
//#endregion
//#region components/header.tsx
function Header({ children }) {
	return /* @__PURE__ */ jsxs(Header$1, { children: [children, /* @__PURE__ */ jsx(UserProfile, {})] });
}
//#endregion
//#region pages/about.tsx
const meta = { title: "About" };
async function About() {
	return /* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx(Header, { children: "About" }), /* @__PURE__ */ jsx("p", { children: "About" })] });
}
//#endregion
export { About as default, meta };

//# sourceMappingURL=about.js.map