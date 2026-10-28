
/**
 * KODAPP - DESPLEGABLES DE MASCOTAS
 *
 * Muestra el campo adicional únicamente
 * cuando se selecciona la opción "otro".
 */

document
  .querySelectorAll<HTMLElement>("[data-match-field]")
  .forEach((grupo) => {

    const selector =
      grupo.querySelector<HTMLSelectElement>(
        "[data-match-select]"
      );

    const contenedor =
      grupo.querySelector<HTMLElement>(
        "[data-match-other]"
      );

    const detalle =
      grupo.querySelector<HTMLTextAreaElement>(
        "[data-match-detail]"
      );

    if (!selector || !contenedor || !detalle) {
      return;
    }

    function actualizarCampo() {
      const otro = selector!.value === "otro";

      contenedor!.hidden = !otro;
      detalle!.disabled = !otro;
      detalle!.required = otro;

      if (!otro) {
        detalle!.setCustomValidity("");
      }
    }

    selector.addEventListener("change", actualizarCampo);

    actualizarCampo();
  });
