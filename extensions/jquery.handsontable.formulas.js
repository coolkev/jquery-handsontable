(function ($) {
    "use strict";
    /**
    * Handsontable Formulas extension. See `demo/formulas.html` for example usage
    * @param {Object} instance
    */
    Handsontable.extension.Formulas = function (instance, settings) {
        var self = this;
        this.instance = instance;
        this.settings = settings;
        //this.customFunctions = settings && settings.functions ? settings.functions : {};

        if (settings && settings.functions) {
            for (var f in settings.functions) {
                Handsontable.extension.Formulas.StandardFunctions.prototype[f] = settings.functions[f];

            };
        }

        instance.container.on("beforedatachange.handsontable", function (event, changes, source) {

            if (source == 'formulas.refreshDependentCells')
                return;

            for (var i = 0, ilen = changes.length; i < ilen; i++) {
                var change = changes[i];
                var newValue = change[3];
                var cell = $(self.instance.getCell(change[0], change[1]));

                if (typeof newValue == "string" && newValue.substring(0, 1) == "=" && newValue.length > 1) {

                    var formula = newValue;
                    var calculatedValue = evaluateFormula(self.instance, formula.substring(1));

                    cell.data('formula', formula);
                    change[3] = calculatedValue;

                    console.log("beforedatachange formula detected: " + newValue + ", calculatedValue: " + calculatedValue);

                }
                else {
                    var oldformula = cell.data('formula');
                    if (oldformula) {

                        $(cell).removeData('formula');

                        console.log("beforedatachange deleted formula (row=" + change[0] + ", col=" + change[1] + ") formula: " + oldformula);
                    }
                }
            }

        });

        instance.container.on("datachange.handsontable", function (event, changes) {

            for (var i = 0, ilen = changes.length; i < ilen; i++) {
                var change = changes[i];
                var newValue = change[3];
                var oldValue = change[2];
                if (newValue === "" && newValue != oldValue) {
                    var cell = $(self.instance.getCell(change[0], change[1]));
                    //need to erase any formulas when deleting values
                    var formula = cell.data('formula');
                    if (formula) {

                        $(cell).removeData('formula');

                        console.log("datachange deleted formula (row=" + change[0] + ", col=" + change[1] + ") formula: " + formula);
                    }
                }

            }

            for (i = 0, ilen = changes.length; i < ilen; i++) {
                change = changes[i];

                if (change[2] !== change[3])
                    self.refreshDependentCells(change[0], change[1]);
            }
        });

        instance.container.on("beginediting.handsontable", function (event, args) {

            var formula = self.getFormulaAtCell(args.row, args.col);
            if (formula)
                args.editValue = formula;

        });


        this.refreshDependentCells = function (row, col) {
            console.log("refreshDependentCells (row=" + row + ", col=" + col + ")");

            var dependentCells = self.getDependentCells(row, col);

            if (dependentCells.length == 0)
                return;

            var blockedColCount = self.instance.blockedCols.count();

            var changes = $.map(dependentCells, function (c) {
                var formula = $(c).data('formula');
                var calculatedValue = evaluateFormula(self.instance, formula.substring(1));
                var previousValue = c.innerHTML;
                if (previousValue != calculatedValue) {
                    var tr = $(c).parent();
                    var colIndex = tr.children().index(c) - blockedColCount;
                    var rowIndex = tr.parent().children().index(tr);

                    return [[rowIndex, colIndex, calculatedValue]];
                }
            });


            self.instance.setDataAtCell(changes, null, null, null, 'formulas.refreshDependentCells');

        };

        var previousGetCellMeta = instance.getCellMeta;

        // is this ok to override a public method in the instance?
        instance.getCellMeta = function (rowOrCell, col) {
            var result = previousGetCellMeta(rowOrCell, col);

            var cell = $(typeof rowOrCell == "number" ? self.getCell(rowOrCell, col) : rowOrCell);

            var formula = cell.data('formula');

            if (formula)
                result.formula = formula;

            return result;
        };


        var previousSetCellMeta = instance.setCellMeta;

        // is this ok to override a public method in the instance?
        instance.setCellMeta = function (row, col, meta) {
            var cell = previousSetCellMeta(row, col, meta);

            if (meta.formula) {
                var calculatedValue = evaluateFormula(self.instance, meta.formula.substring(1));
                self.instance.setDataAtCell(row, col, calculatedValue, null, 'formulas.setCellMeta');
                $(cell).data("formula", meta.formula);
            }
            else {
                if ($(cell).data('formula')) {
                    self.instance.setDataAtCell(row, col, '', null, 'formulas.setCellMeta');
                }

            }
            return cell;
        };


    };


    var evaluateFormula = function (instance, expression) {

        var invalidCells = false;
        var referenceCount = 0;
        var result = expression.replace(/\$?([A-Z])\$?(\d+)/gi, function (m, col, row) {

            referenceCount++;
            var colIndex = translateColLetterToIndex(col);

            if (colIndex == -1) {
                invalidCells = true;
                return;
            }
            var rowIndex = row - 1;
            var value = instance.getDataAtCell(rowIndex, colIndex);

            var v;
            if (value == null)
                return value;
            if ($.isNumeric(value))
                return value;
            if (value.charAt(value.length - 1) == '%') {
                v = value.substring(0, value.length - 1);
                if ($.isNumeric(v))
                    return v / 100;
            }
            //maybe we should use https://github.com/jquery/globalize for formatting/parsing
            else {
                //strip out all commas spaces, $ and try again
                v = value.replace(/(,|\s|\$)/g, '');
                if ($.isNumeric(v))
                    return v;
            }


            return '"' + value + '"';

        });

        if (invalidCells)
            return "#ERROR";

        try {
            return maskedEval(result);
        } catch (ex) {
            return "#ERROR " + ex;

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


    Handsontable.extension.Formulas.prototype.getDependentCells = function (row, col) {
        var tbody = this.instance.table.find("tbody")[0];

        //Only A-Z currently - need to handle > double letters still...
        var colLetter = String.fromCharCode(col + 65);

        var pattern = '\\$?' + colLetter + '\\$?' + (row + 1);
        var regex = new RegExp(pattern);

        var result = $('td', tbody.childNodes).map(function () {

            var formula = $(this).data('formula');
            if (formula) {
                if (regex.test(formula)) {
                    return this;
                }
            }

        });

        return result;

    };




    var maskedEval = function (scr) {
        // set up an object to serve as the context for the code
        // being evaluated. 
        var context = $.extend(new Handsontable.extension.Formulas.StandardFunctions());

        // execute script in private context
        return (new Function("with(this) { return " + scr + "}")).call(context);
    };

    Handsontable.extension.Formulas.StandardFunctions = function () {

    };

    Handsontable.extension.Formulas.StandardFunctions.prototype = {
        round: function (num, digits) {
            digits = digits || 0;
            var multiplier = Math.pow(10, digits);

            var number;
            if ($.isNumeric(num))
                number = num;
            else {
                number = parseFloat(num);
            }
            return Math.round(parseFloat(number) * multiplier) / multiplier;
        },

        percent: function (num, digits) {

            var result = this.round(num * 100, digits);
            return result + "%";
        }
    };
})(jQuery);