export const isMobile = () => {
  return false;
  // return Cypress.config("viewportWidth") < Cypress.env("mobileViewportWidthBreakpoint");
};
