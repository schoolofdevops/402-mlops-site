---
sidebar_position: 2
title: "Lab: Setting up your MLOps Workstation"
---
# Setting up your MLOps Workstation

Before you can build anything, you need a machine that is ready to run it. In this lab you
are going to install the tools, fork the project you would work on for the rest of the
course, and bring up your first service, which is an MLflow tracking server.

By the end of it you would have a working environment and one thing already running in a
container.

## What will you learn

  * How to set up a Python environment with `uv`, which is a faster replacement for `pip` and `venv`
  * How to get a container runtime working on your machine, whichever operating system you are on
  * How to fork and clone the project repository, and why forking matters here
  * What lives in each directory of the project
  * How to launch MLflow with Docker Compose and confirm it is reachable
  * How to open and run the project notebooks

## What you need

  * A laptop or a virtual machine with at least 4 CPU cores, 8 GB RAM and 20 GB free disk
  * An internet connection, since you would be pulling images and packages
  * About 45 minutes

You do not need any machine learning background for this lab. You are only setting things up.

## PART I - Installing the tools

Let's install four things. Python, a package manager, Git, and a container runtime.

**Install** Python and Git first, if you do not already have them.

  * Python : [https://www.python.org/](https://www.python.org/)
  * Git : [https://git-scm.com/downloads](https://git-scm.com/downloads)

**Verify** both.

```
python --version
git --version
```

You want Python 3.11 or newer. If your system Python is older, do not worry about upgrading
it. You would create a separate environment with the exact version in PART II.

### Installing uv

`uv` is a Python package and project manager. You would use it instead of `pip` and `venv`.
It does the same job and it is a lot faster, which matters when you are installing large
machine learning libraries.

**Install** it from the official instructions.

  * uv : [https://docs.astral.sh/uv/getting-started/installation/](https://docs.astral.sh/uv/getting-started/installation/)

**Verify** the installation.

```
uv --version
```

### Setting up a container runtime

You would be building and running containers throughout this course, so you need a runtime.
Which one you pick depends on whose machine it is.

If this is your **personal machine**, install Docker Desktop. Be aware of the licensing
terms, since Docker Desktop is not free for larger companies.

  * Docker Desktop : [https://www.docker.com/products/docker-desktop/](https://www.docker.com/products/docker-desktop/)

If this is a **company provided machine**, install Rancher Desktop instead. It is open
source, free, and it does not create any licensing question for your employer.

  * Rancher Desktop : [https://rancherdesktop.io/](https://rancherdesktop.io/)

Both give you the same `docker` and `docker compose` commands, so the rest of the course
works either way. If you are on Linux and prefer Podman, that works too. Podman ships a
`podman compose` command which behaves the same way.

**Verify** the runtime is up.

```
docker version
docker compose version
```

Make sure the output shows both a Client and a Server section. If you only see the Client,
the runtime is installed but not started. Open Docker Desktop or Rancher Desktop and wait
for it to finish starting.

### Setting up an editor

This is not strictly required, but it would make the rest of the course much easier. Visual
Studio Code can edit code, run notebooks and open a terminal in the same window.

  * Visual Studio Code : [https://code.visualstudio.com/](https://code.visualstudio.com/)

Once installed, add two extensions from the Extensions panel.

  * **Python**, which gives you interpreter selection and debugging
  * **Jupyter**, which lets you run notebooks inside the editor

### Creating your accounts

You would need two accounts later in the course. Create them now so that you are not stopped
halfway through Lab 5.

  * GitHub : [https://github.com/](https://github.com/)
  * Docker Hub : [https://hub.docker.com/](https://hub.docker.com/)

## PART II - Getting the project

### Forking the repository

Go to the project repository and press Fork.

  * [https://github.com/mlopsbootcamp/house-price-predictor](https://github.com/mlopsbootcamp/house-price-predictor)

Forking matters here. You are going to change this code, commit to it, and later point a CI
pipeline and Argo CD at it. All of that needs write access, and you would not have write
access to someone else's repository. From this point on, the repo you work with is yours.

**Clone** your fork.

`replace xxxxxx with your GitHub username`

```
git clone https://github.com/xxxxxx/house-price-predictor.git
cd house-price-predictor
```

### Creating the Python environment

**Create** a virtual environment pinned to Python 3.11.

```
uv venv --python 3.11
```

**Activate** it.

```
source .venv/bin/activate
```

`on Windows PowerShell, use .venv\Scripts\Activate.ps1 instead`

**Confirm** you are now on the right Python.

```
python --version
```

[sample output]
```
Python 3.11.9
```

You should also see `(house-price-predictor)` or `(.venv)` at the start of your shell prompt.
That is how you know the environment is active. If you open a new terminal later, you would
have to activate it again.

**Install** the dependencies.

```
uv pip install -r requirements.txt
```

This pulls in pandas, scikit-learn, MLflow, FastAPI and the rest. It would take a minute or
two the first time.

### Looking around the project

Before you run anything, it is worth knowing what is where. **List** the top level.

```
ls
```

The directories you would care about are,

  * **data/raw**, which holds the original housing dataset as it came to you
  * **data/processed**, which is empty right now. Your cleaned and feature engineered data would land here
  * **notebooks**, which holds four notebooks that walk through the data science side of the work
  * **src/data**, **src/features**, **src/models**, which hold the same steps as the notebooks but written as scripts you can run from a pipeline
  * **src/api**, which is the FastAPI application that serves predictions. You would package this in Lab 4
  * **streamlit_app**, which is the small web interface that calls the API
  * **models/trained**, which is empty now and would hold your trained model and preprocessor
  * **configs**, which holds the model configuration produced by the experiments
  * **deployment**, which holds everything to do with running this on infrastructure

Notice the split between `notebooks` and `src`. The notebooks are how a data scientist works,
that is exploring, plotting and trying things out. The scripts under `src` are the same logic
in a form that a pipeline can run without a human clicking cells. Turning the first into the
second is a large part of what MLOps actually is, and you would do exactly that in Lab 3.

## PART III - Bringing up MLflow

MLflow is where every training run gets recorded. Which algorithm, which parameters, which
accuracy score. Without it you would be keeping track of experiments in a spreadsheet, or
more likely not keeping track at all.

You would run it as a container, using the compose file that ships with the project.

**Switch** to the MLflow deployment directory and **start** it.

```
cd deployment/mlflow
docker compose up -d
docker compose ps
cd ../../
```

[sample output]
```
CONTAINER ID  IMAGE                         COMMAND               CREATED        STATUS        PORTS                   NAMES
dc209d985e2c  ghcr.io/mlflow/mlflow:latest  mlflow server --h...  8 seconds ago  Up 8 seconds  0.0.0.0:5555->5000/tcp  mlflow-tracking-server
```

Look at the `PORTS` column. The container listens on 5000 inside, and that is published to
5555 on your machine. So the address you would use is 5555, not 5000. This catches people
out later when they set the tracking URI.

**Verify** by browsing to [http://localhost:5555/](http://localhost:5555/).

You should see the MLflow interface with an empty Experiments list. Empty is correct. You
have not trained anything yet.

`if the page does not load, run docker compose logs in deployment/mlflow to see why`

### Running the notebooks

**Open** the project folder in Visual Studio Code.

```
code .
```

Then open `notebooks/00_data_engineering.ipynb`. When you run the first cell, VS Code would
ask you which kernel to use. Pick the one pointing at `.venv` inside your project. If you
pick the system Python instead, none of the installed packages would be found and every
import would fail.

Run the first couple of cells to confirm the kernel works. You do not need to work through
the whole notebook yet. That is Lab 3.

#### Observe

Look at the MLflow page again. It is running in a container, but the experiments it records
have to be stored somewhere. Open `deployment/mlflow/docker-compose.yaml` and find where that
data goes. Ask yourself what would happen to your experiment history if you ran
`docker compose down -v` on this stack.

## Exercise

Get comfortable with starting and stopping the environment, because you would do it many
times over the next few labs.

  * Stop the MLflow stack, and confirm from `docker ps` that nothing is running
  * Start it again, and confirm the interface still loads
  * Close your terminal, open a new one, and get back to a working state from scratch, that is
    into the project directory with the virtual environment active
  * Write down the three commands that took you there. You would use them at the start of
    every remaining lab

## Cleanup

Leave everything running. You need all of it for Lab 3.

If you do want to stop for the day, bring the stack down without removing the volumes.

```
cd deployment/mlflow
docker compose down
cd ../../
```

`do not add the -v flag, since that would delete your experiment history along with the containers`

#### Summary

In this lab you set up a working MLOps workstation. You installed Python, `uv`, Git and a
container runtime, forked the project so that you own the code you would be changing, created
an isolated Python environment, and brought up MLflow as your first running service.

You also had a look at the project layout, and saw the split between notebooks and scripts
that the rest of the course is built around.

Next you are going to use this setup properly. In Lab 3 you would take the raw housing data,
clean it, engineer features from it, and train a model, recording every experiment into the
MLflow server you just started.

##### Reading List

  * [uv documentation](https://docs.astral.sh/uv/)
  * [MLflow Tracking](https://mlflow.org/docs/latest/tracking.html)
  * [Docker Compose overview](https://docs.docker.com/compose/)
  * [Rancher Desktop documentation](https://docs.rancherdesktop.io/)
  * [Fork a repository on GitHub](https://docs.github.com/en/get-started/quickstart/fork-a-repo)

## Search Keywords

  * uv venv python
  * uv pip install requirements
  * docker compose up detached
  * mlflow tracking server docker
  * rancher desktop vs docker desktop
  * vscode jupyter kernel select venv
  * git fork clone upstream
