# ResizableTable Plugin

A JavaScript plugin for making HTML tables resizable and collapsible.

## Features (Planned)

*   Resizable columns
*   Collapsible columns (optional, per column)
*   Persistence of column sizes/state (e.g., using localStorage)
*   Touch support for resizing
*   Programmatic control (e.g., reset to original sizes, destroy instance)
*   Callbacks/events for resize/collapse actions

## Basic Usage

To use the ResizableTable plugin, include the script in your HTML file and then instantiate the `ResizableTable` class.

1.  **Include the script:**

    Add the following script tag to your HTML, preferably before the closing `</body>` tag.
    (Note: Once a build process is in place, this will point to a file in the `dist/` directory.)

    ```html
    <script src="src/ResizableTable.js"></script>
    <!-- Or eventually: <script src="dist/ResizableTable.min.js"></script> -->
    ```

2.  **Prepare your HTML Table:**

    Ensure you have a standard HTML `<table>` element with an `id` or other selectable attribute. The table should ideally have a `<thead>` section.

    ```html
    <table id="myCoolTable">
      <thead>
        <tr>
          <th>Column 1</th>
          <th>Column 2</th>
          <th>Another Column</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Data A1</td>
          <td>Data B1</td>
          <td>Data C1</td>
        </tr>
        <tr>
          <td>Data A2</td>
          <td>Data B2</td>
          <td>Data C2</td>
        </tr>
      </tbody>
    </table>
    ```

3.  **Initialize the plugin:**

    After the DOM is loaded, create a new instance of `ResizableTable`, passing either the table element itself or a CSS selector string.

    ```javascript
    document.addEventListener('DOMContentLoaded', function() {
      // Ensure the table element exists in the DOM
      const myTableElement = document.getElementById('myCoolTable');
      // or const myTableElement = document.querySelector('#myCoolTable');

      if (myTableElement) {
        try {
          // Initialize with the DOM element
          const resizableTable = new ResizableTable(myTableElement);
          console.log("ResizableTable initialized for element:", myTableElement);

          // Or, initialize with a CSS selector:
          // const resizableTableFromString = new ResizableTable('#myCoolTable');
          // console.log("ResizableTable initialized for selector '#myCoolTable'");

        } catch (error) {
          console.error("Failed to initialize ResizableTable:", error.message);
        }
      } else {
        console.error("Table element '#myCoolTable' not found.");
      }
    });
    ```

---

**Note:** This project is currently under active development. Features and API are subject to change.
