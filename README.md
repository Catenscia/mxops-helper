# mxops-helper README

`mxops-helper` is an extension that aims to ease the usage of the python library [MxOps](https://github.com/Catenscia/MxOps). The objective is to provide tips, autocompletion and templates for the developpers that use `MxOps`.

## Features

For now, `mxops-helper` has only two auto-fill features:

- if you write `mxops` at the beginning of an empty `yaml` file, it will fill the file with an example of `MxOps` `Scene` that will make it easier to get started.

![Auto fill with a default `Scene`](images/default_config.gif)

- In a `Scene`, when providing a new `Step` or a new `Check`, if you write `- type:` it will propose you all the `Steps` or `Checks` that are available. If you select one, it will automatically write all the elements of the `Step` or `Check` for you. 

![Auto fill a `Step` attributes](images/step_auto_completion.gif)

## Extension Settings

This extension has the following settings that you can modify as you need:

* `mxopsHelper.pythonLibraryVersion`: Version of the MxOps Python library you're using.

## Release Notes

### 1.0.0

Initial release of `mxops-helper`
