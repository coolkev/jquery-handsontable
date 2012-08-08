(function ($) {
    "use strict";
    /**
    * Handsontable Formulas extension. See `demo/formulas.html` for example usage
    * @param {Object} instance
    */
    Handsontable.extension.Formulas = function (instance) {
        var self = this;
        this.instance = instance;

        instance.container.on("beforedatachange.handsontable", function (event, changes) {
            for (var i = 0, ilen = changes.length; i < ilen; i++) {
                var change = changes[i];
                var newValue = change[3];
                var cell = self.instance.getCell(change[0], change[1]);

                if (typeof newValue == "string" && newValue.substring(0, 1) == "=" && newValue.length > 1) {
                    var formula = newValue;
                    var calculatedValue = evaluateFormula(self.instance, formula.substring(1));

                    $(cell).data('formula', formula);
                    changes[i][3] = calculatedValue;
                }
                else {
                    $(cell).removeData('formula');

                }
            }

        });

        instance.container.on("datachange.handsontable", function (event, changes) {
            for (var i = 0, ilen = changes.length; i < ilen; i++) {
                var change = changes[i];
                var newValue = change[3];
                var oldValue = change[2];
                if (newValue === "" && newValue != oldValue) {
                    var cell = self.instance.getCell(change[0], change[1]);
                    //need to erase any formulas when deleting values
                    $(cell).removeData('formula');

                }
            }
            
        });

        instance.container.on("beginediting.handsontable", function (event, args) {

            var formula = self.getFormulaAtCell(args.row, args.col);
            if (formula)
                args.editValue = formula;

        });


        var previousGetCellMeta = instance.getCellMeta;

        instance.getCellMeta = function (rowOrCell, col) {
            var result = previousGetCellMeta(rowOrCell, col);

            var cell = $(typeof rowOrCell == "number" ? self.getCell(rowOrCell, col) : rowOrCell);

            var formula = cell.data('formula');
            
            if (formula)
                result.formula = formula;

            return result;
        };
    };


    var evaluateFormula = function (instance, expression) {

        var invalidCells = false;
        var referenceCount = 0;
        var result = expression.replace(/\$?([A-Z])\$?(\d+)/g, function (m, col, row) {

            referenceCount++;
            var colIndex = translateColLetterToIndex(col);

            if (colIndex == -1) {
                invalidCells = true;
                return;
            }
            var rowIndex = row - 1;
            var value = instance.getDataAtCell(rowIndex, colIndex);


            if ($.isNumeric(value))
                return value;
            else if (value.charAt(value.length - 1) == '%') {
                var v = value.substring(0, value.length - 1);
                if ($.isNumeric(v))
                    return v / 100;
            }


            return '"' + value + '"';

        });

        if (invalidCells)
            return "#ERROR";

        try {
            return eval(result);
        } catch (ex) {
            return "#ERROR";

        }
    };

    var translateColLetterToIndex = function (col) {

        var asc = col.charCodeAt(0);
        if (asc >= 65 && asc <= 93)
            return asc - 65;

        return -1;
    };


    Handsontable.extension.Formulas.prototype.getFormulaAtCell = function (row, col) {
        var cell = this.instance.getCell(row, col);
        var formula = $(cell).data('formula');

        return formula;
    };



})(jQuery);