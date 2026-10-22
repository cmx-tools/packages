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
//#region portrait.svg
var portrait_default = {
	"src": "/_assets/c5ff722bda9782ae33c23d4bc16ab6832e0056e10cf93ad0df593d1805850c79.svg",
	"width": 24,
	"height": 16,
	"preview": "/_assets/bdc5d95bfb0dcda57c928bcc64a82f4afea6dd0177fb322dbce23fc7c87fdb31.svg"
};
const AssetImage = __registerExternal({
	from: "@example/ui-library",
	import: "AssetImage"
});
//#endregion
//#region pages/about.tsx
const meta = {
	title: "About",
	accessory: /* @__PURE__ */ jsx(UserProfile$1, {})
};
async function About() {
	return /* @__PURE__ */ jsxs("div", { children: [
		/* @__PURE__ */ jsx(Header, { children: "About" }),
		/* @__PURE__ */ jsx("p", { children: "About" }),
		/* @__PURE__ */ jsx(AssetImage, {
			src: portrait_default.preview,
			width: portrait_default.width,
			height: portrait_default.height,
			alt: "Portrait"
		})
	] });
}
//#endregion
export { About as default, meta };

//# sourceMappingURL=about.js.map