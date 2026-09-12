---
sidebar_position: 2
title: "Lab: From Raw Data to a Trained Model"
---
# From Raw Data to a Trained Model

You have a working environment and an empty MLflow server. In this lab you are going to fill
it. You would take the raw housing data, clean it, build new features out of it, run a set of
experiments to find the best algorithm, and train a model you can hand over for deployment.

This is the data science half of the work. You would do it twice, once in notebooks to
understand it, and once as scripts, because a pipeline cannot click through notebook cells.

## What will you learn

  * How raw data gets cleaned, and why cleaning has to happen before anything else
  * What feature engineering is, and how new features get built from existing columns
  * Why the data is split into training and test sets, and what `X_train`, `y_train`, `X_test` and `y_test` mean
  * How a set of algorithms and hyperparameters gets tried out and compared
  * How every run gets recorded in MLflow so you can prove which model is best
  * What artifacts you would hand over to the MLOps side, and why there are two of them

## Pre Requisites

You should have finished Lab 2. Before you start, get back to a working state.

```
cd house-price-predictor
source .venv/bin/activate
```

**Confirm** MLflow is running, since you would be writing to it later in this lab.

```
docker ps
```

Look for `mlflow-tracking-server` in the list. If it is not there, start it again.

```
cd deployment/mlflow && docker compose up -d && cd ../../
```

## The pipeline you are about to build

```bash
   data/raw/house_data.csv
            |
            |  src/data/run_processing.py
            v
   data/processed/cleaned_house_data.csv
            |
            |  src/features/engineer.py
            v
   data/processed/featured_house_data.csv  +  models/trained/preprocessor.pkl
            |
            |  src/models/train_model.py     (configs/model_config.yaml)
            v
   models/trained/house_price_model.pkl   ---> logged to MLflow
```

where,

  * **cleaned data** is the raw file with bad rows and bad values dealt with
  * **featured data** is the cleaned data plus new columns the model can learn better from
  * **preprocessor.pkl** is the transformation itself, saved so the same one can be applied later at prediction time
  * **house_price_model.pkl** is the trained model
  * **model_config.yaml** holds the algorithm and the parameters that won the experiments

Notice there are two files at the end, not one. That catches people out. The model alone is
not enough, because a prediction request arrives as raw values and has to go through exactly
the same transformation the model was trained on. If the two ever drift apart, your
predictions become quietly wrong. You would meet both of these files again in Lab 4.

## PART I - Cleaning the data

Everything starts with data engineering. **Open** the first notebook and read through it.

```
notebooks/00_data_engineering.ipynb
```

Run the cells and watch what it does. It loads the raw CSV, looks for missing values, looks
for values that make no sense such as a house with zero bathrooms, and decides what to do with
each. This is the unglamorous part of machine learning and it is where most of the time
actually goes.

Then have a look at the second notebook.

```
notebooks/01_exploratory_data_analysis.ipynb
```

This one is exploratory data analysis, or EDA. You would plot distributions, look at how
price relates to square footage, and check whether any column is strongly related to another.
The aim is not to produce a model. The aim is to understand the data well enough to know what
features are worth building.

Now let's do the same cleaning as a script, which is what a pipeline would run.

**Run** the processing step.

```
python src/data/run_processing.py \
  --input data/raw/house_data.csv \
  --output data/processed/cleaned_house_data.csv
```

**Verify** the output file was created.

```
ls data/processed
```

[sample output]
```
README.md              cleaned_house_data.csv
```

#### Observe

Open both CSV files and compare the row counts. Are there fewer rows in the cleaned file? If
so, some rows were dropped. Ask yourself which ones, and whether dropping was the right call.
In real work, throwing away rows silently is one of the easiest ways to introduce bias into a
model without noticing.

## PART II - Building features

A feature is nothing but a column the model learns from. Feature engineering is where you
create new columns out of the ones you already have, because the new ones carry the signal
more directly.

**Open** the feature engineering notebook and read it through.

```
notebooks/02_feature_engineering.ipynb
```

Three ideas run through this step.

**New columns built from existing ones.** The raw data has `year_built`. What the price
actually depends on is how old the house is, so `house_age` is a better column to learn from.
Similarly `price_per_sqft` and `bed_bath_ratio` carry more meaning than the raw counts do on
their own.

**Categories turned into numbers.** A model cannot learn from the word `suburban`. One hot
encoding turns a column like `location` into a set of yes or no columns, one per value.

**The transformation is saved, not just applied.** This is the important part. The scaling and
encoding get fitted on your training data, and then written out as `preprocessor.pkl`. At
prediction time, the exact same object is loaded and applied to the incoming request.

**Run** the feature engineering step.

```
python src/features/engineer.py \
  --input data/processed/cleaned_house_data.csv \
  --output data/processed/featured_house_data.csv \
  --preprocessor models/trained/preprocessor.pkl
```

[sample output]
```
2025-04-04 13:37:47,442 - feature-engineering - INFO - Loading data from data/processed/cleaned_house_data.csv
2025-04-04 13:37:47,448 - feature-engineering - INFO - Creating new features
2025-04-04 13:37:47,449 - feature-engineering - INFO - Created 'house_age' feature
2025-04-04 13:37:47,450 - feature-engineering - INFO - Created 'price_per_sqft' feature
2025-04-04 13:37:47,450 - feature-engineering - INFO - Created 'bed_bath_ratio' feature
2025-04-04 13:37:47,450 - feature-engineering - INFO - One-hot encoding 'location' feature
2025-04-04 13:37:47,452 - feature-engineering - INFO - One-hot encoding 'condition' feature
2025-04-04 13:37:47,453 - feature-engineering - INFO - Created featured dataset with shape: (77, 18)
2025-04-04 13:37:47,454 - feature-engineering - INFO - Saved featured data to data/processed/featured_house_data.csv
```

Read that log line by line. It tells you exactly the three ideas above, in order. Note the
final shape, `(77, 18)`. You started with a handful of columns and you now have eighteen.

**Verify** the preprocessor was written out.

```
ls models/trained/
```

[sample output]
```
README.md        preprocessor.pkl
```

`if preprocessor.pkl is missing, check that you passed the --preprocessor flag. Without it the script still produces the CSV but saves nothing`

## PART III - Running experiments

You now have data a model can learn from. The question is which model.

**Open** the experimentation notebook.

```
notebooks/03_experimentation.ipynb
```

Work through it. Three things happen here, and each one is worth understanding before you run
the script version.

### Splitting the data

You cannot judge a model by how well it does on the data it learned from. It has seen those
answers already. So the data gets split into two parts, usually around 80 percent for
training and 20 percent held back for testing.

The four names you would see everywhere are,

  * **X_train**, the feature columns the model learns from
  * **y_train**, the answers, that is the actual prices, for those same rows
  * **X_test**, feature columns the model has never seen
  * **y_test**, the real prices for those unseen rows, used only to score the model

By convention capital `X` is the input and small `y` is the thing you are predicting. Once you
know that, most machine learning code becomes a lot easier to read.

### Defining algorithms and parameter grids

You would not pick one algorithm and hope. You would list several, and for each one list the
settings worth trying. Those settings are called hyperparameters, that is values you choose
rather than values the model learns.

Take a random forest as an example. How many trees should it build? How deep should each tree
go? There is no single right answer, so you give a small list of candidates for each, and let
the code try the combinations. That list of candidates is the grid.

### Comparing the runs

Every combination gets trained and scored, and the scores are compared. The winner becomes
your model, and its settings get written out to a config file.

**Run** the notebook to the end. It produces `configs/model_config.yaml`, which holds the
winning algorithm along with its parameters.

**Verify** the config exists.

```
ls configs/
```

`if the notebook did not run to completion, download a ready made config instead`

  * [model_config sample](https://gist.githubusercontent.com/initcron/702de323bab9a3b85ee3cde295d06d49/raw/fcf5e2bf6d3dc6739d2456a556a14ef68e929d75/model_config.json)

Save it as `configs/model_config.yaml` and carry on. You would still get a working model. You
would just be using someone else's experiment results rather than your own.

## PART IV - Training the final model

The notebook was for exploring. This step is the one a pipeline would run, unattended, on a
build server. It takes the config the experiments produced and trains the final model from it.

**Train** the model and log everything to MLflow.

```
python src/models/train_model.py \
  --config configs/model_config.yaml \
  --data data/processed/featured_house_data.csv \
  --models-dir models \
  --mlflow-tracking-uri http://localhost:5555
```

where,

  * **--config** points at the algorithm and hyperparameters chosen by the experiments
  * **--data** is the featured dataset from PART II, not the cleaned one and not the raw one
  * **--models-dir** is where the trained model gets written
  * **--mlflow-tracking-uri** is the address of the server you started in Lab 2

`remember the port is 5555, not 5000. 5000 is the port inside the container`

**Verify** the model file was produced.

```
ls models/trained/
```

[sample output]
```
README.md        house_price_model.pkl      preprocessor.pkl
```

Both files are now present. That pair is what you would hand over to the MLOps side.

**Check** the run was recorded. Browse to [http://localhost:5555/](http://localhost:5555/).

The Experiments list should no longer be empty. Open the run and look at what got captured,
which is the parameters used, the metrics scored, and the model itself stored as an artifact.

#### Observe

Run the training command a second time without changing anything. Go back to MLflow and look
at the Experiments list. How many runs do you see now? Ask yourself what the value of that is.
Six months from now, when someone asks why the model predicts what it predicts, this history
is the only thing that can answer them.

## Exercise

Prove to yourself that the experiment tracking is actually useful.

  * Open `configs/model_config.yaml` and change one hyperparameter to a clearly worse value
  * Train again with the same command
  * In MLflow, compare the two runs side by side and find the metric that got worse
  * Put the original value back and train once more, so that your final model is the good one

You should end up with three runs recorded and be able to point at exactly which change caused
which result. That is the whole point of tracking.

## Cleanup

Keep everything. The two files in `models/trained/` are the input to Lab 4.

Do commit your work, though, since you would need it in the repository from Lab 5 onwards.

```
git status
git add configs data/processed
git commit -am "add processed data and model config"
git push origin main
```

`the trained .pkl files are usually not committed to git, as they are build outputs rather than source. Check .gitignore before adding them`

#### Summary

In this lab you walked the full path from a raw CSV to a trained model. You cleaned the data,
built new features from it, saved the transformation as a reusable preprocessor, ran
experiments to pick an algorithm, and trained the final model with every run recorded in
MLflow.

You also did each step twice, once in a notebook and once as a script. That difference is the
whole handover problem in a sentence. A notebook is how the work gets figured out. A script is
how it gets repeated.

You are now holding the two files a data scientist would hand you in real life, which are the
model and the preprocessor. In Lab 4 you would take those two files, wrap them in a FastAPI
service, and package the whole thing into a container image.

##### Reading List

  * [scikit-learn train_test_split](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.train_test_split.html)
  * [scikit-learn Pipelines and composite estimators](https://scikit-learn.org/stable/modules/compose.html)
  * [One hot encoding explained](https://scikit-learn.org/stable/modules/generated/sklearn.preprocessing.OneHotEncoder.html)
  * [MLflow Tracking runs and experiments](https://mlflow.org/docs/latest/tracking.html#runs)
  * [Hyperparameter tuning with GridSearchCV](https://scikit-learn.org/stable/modules/grid_search.html)

## Search Keywords

  * data cleaning pipeline python
  * exploratory data analysis eda
  * feature engineering one hot encoding
  * sklearn preprocessor joblib pickle
  * x_train y_train x_test y_test
  * hyperparameter grid search
  * mlflow log params metrics artifacts
  * mlflow tracking uri
