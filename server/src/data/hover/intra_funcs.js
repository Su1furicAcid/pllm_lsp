"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.intraFuncs = void 0;
exports.intraFuncs = [
    {
        "name": "read_file",
        "signature": "(str) -> (str)",
        "description": "Reads the content of a file at the specified path and returns it as a string."
    },
    {
        "name": "write_file",
        "signature": "(str, str) -> (unit)",
        "description": "Writes the specified content to a file at the given path. If the file does not exist, it will be created."
    },
    {
        "name": "append_file",
        "signature": "(str, str) -> (unit)",
        "description": "Appends the specified content to a file at the given path. If the file does not exist, it will be created."
    },
    {
        "name": "read_lines",
        "signature": "(str) -> (list[str])",
        "description": "Reads the content of a file at the specified path and returns it as a list of strings, where each string is a line from the file."
    },
    {
        "name": "write_lines",
        "signature": "(str, list[str]) -> (unit)",
        "description": "Writes a list of strings to a file at the specified path, with each string on a new line. If the file does not exist, it will be created."
    },
    {
        "name": "str_to_int",
        "signature": "(str) -> (int)",
        "description": "Converts a string to an integer. If the string cannot be converted, it raises a ValueError."
    },
    {
        "name": "int_to_str",
        "signature": "(int) -> (str)",
        "description": "Converts an integer to a string."
    },
    {
        "name": "console",
        "signature": "(any) -> (unit)",
        "description": "Writes the string representation of the given value to the console."
    }
];
//# sourceMappingURL=intra_funcs.js.map