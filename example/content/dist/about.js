import { __registerExternal, jsx, jsxs } from "@cmx-tools/runtime/jsx-runtime";
const UserProfile$1 = __registerExternal({
	from: "@example/backend-contract",
	import: "UserProfile"
});
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
	return /* @__PURE__ */ jsx(Header$1, {
		accessory: /* @__PURE__ */ jsx(UserProfile, {}),
		children
	});
}
//#endregion
//#region pages/about.tsx
const meta = {
	title: "About",
	accessory: /* @__PURE__ */ jsx(UserProfile$1, {})
};
async function About() {
	return /* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx(Header, { children: "About" }), /* @__PURE__ */ jsx("p", { children: "About" })] });
}
//#endregion
export { About as default, meta };

//# sourceMappingURL=about.js.map